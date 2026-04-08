import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Star, Plus, Trash2, Edit2, Save, X, Search, Filter,
  ChevronLeft, Award, BarChart3, Users, Layers, TrendingDown,
  AlertTriangle, CheckCircle, List, Upload
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { authJson, authFetch } from "@/lib/utils";

const API = "/api";

const PROFICIENCY_LABELS: Record<number, { label: string; color: string; bg: string }> = {
  1: { label: "מתחיל", color: "text-muted-foreground", bg: "bg-muted/30" },
  2: { label: "בסיסי", color: "text-blue-400", bg: "bg-blue-500/10" },
  3: { label: "בינוני", color: "text-yellow-400", bg: "bg-yellow-500/10" },
  4: { label: "מתקדם", color: "text-green-400", bg: "bg-green-500/10" },
  5: { label: "מומחה", color: "text-purple-400", bg: "bg-purple-500/10" },
};

function ProficiencyStars({ level, onChange }: { level: number; onChange?: (n: number) => void }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <Star
          key={n}
          className={`w-4 h-4 ${onChange ? "cursor-pointer hover:scale-110 transition-transform" : ""} ${
            n <= level ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"
          }`}
          onClick={() => onChange?.(n)}
        />
      ))}
    </div>
  );
}

interface SkillRow {
  id: number;
  employee_id: number;
  employee_name: string;
  department: string;
  skill_name: string;
  skill_category: string;
  proficiency_level: number;
  certified_date?: string;
  expiry_date?: string;
  assessed_by?: string;
  notes?: string;
}

interface Props {
  employeeId?: number;
  employeeName?: string;
  department?: string;
  readOnly?: boolean;
}

export default function SkillsMatrixPage({ employeeId, employeeName, department, readOnly }: Props) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showBulkForm, setShowBulkForm] = useState(false);
  const [showGapAnalysis, setShowGapAnalysis] = useState(false);
  const [editingSkill, setEditingSkill] = useState<SkillRow | null>(null);
  const [form, setForm] = useState<any>({});
  const [bulkText, setBulkText] = useState("");

  const queryParams = new URLSearchParams();
  if (employeeId) queryParams.set("employee_id", String(employeeId));
  if (filterCategory) queryParams.set("category", filterCategory);
  if (filterDept && !employeeId) queryParams.set("department", filterDept);

  const { data: skills = [], isLoading, refetch } = useQuery<SkillRow[]>({
    queryKey: ["skills-matrix", employeeId, filterCategory, filterDept],
    queryFn: () => authJson(`${API}/skills-matrix?${queryParams}`),
  });

  const { data: categories = [] } = useQuery<string[]>({
    queryKey: ["skills-matrix-categories"],
    queryFn: () => authJson(`${API}/skills-matrix/categories`),
  });

  const { data: summary = [] } = useQuery<any[]>({
    queryKey: ["skills-matrix-summary", filterDept],
    queryFn: () => authJson(`${API}/skills-matrix/summary${filterDept ? `?department=${filterDept}` : ""}`),
    enabled: !employeeId,
  });

  const { data: gapAnalysis = [] } = useQuery<any[]>({
    queryKey: ["skills-gap", employeeId, department],
    queryFn: () => {
      const p = new URLSearchParams();
      if (employeeId) p.set("employee_id", String(employeeId));
      if (department) p.set("department", department);
      return authJson(`${API}/skills-matrix/gap-analysis?${p}`);
    },
    enabled: showGapAnalysis,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingSkill) {
        return authFetch(`${API}/skills-matrix/${editingSkill.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }).then(r => r.json());
      } else {
        return authFetch(`${API}/skills-matrix`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...data, employeeId, employeeName, department }),
        }).then(r => r.json());
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skills-matrix"] });
      setShowForm(false);
      setEditingSkill(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => authFetch(`${API}/skills-matrix/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["skills-matrix"] }),
  });

  const bulkMutation = useMutation({
    mutationFn: (skills: any[]) => authFetch(`${API}/skills-matrix/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId, employeeName, department, skills }),
    }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skills-matrix"] });
      setShowBulkForm(false);
      setBulkText("");
    },
  });

  const handleBulkSave = () => {
    const lines = bulkText.split("\n").map(l => l.trim()).filter(Boolean);
    const skills = lines.map(line => {
      const parts = line.split(",").map(p => p.trim());
      return {
        skillName: parts[0],
        skillCategory: parts[1] || "",
        proficiencyLevel: parseInt(parts[2] || "3", 10) || 3,
      };
    }).filter(s => s.skillName);
    if (skills.length) bulkMutation.mutate(skills);
  };

  const openCreate = () => {
    setEditingSkill(null);
    setForm({ proficiencyLevel: 3, skillCategory: "", skillName: "" });
    setShowForm(true);
  };

  const openEdit = (s: SkillRow) => {
    setEditingSkill(s);
    setForm({
      skillName: s.skill_name,
      skillCategory: s.skill_category,
      proficiencyLevel: s.proficiency_level,
      certifiedDate: s.certified_date?.slice(0, 10) || "",
      expiryDate: s.expiry_date?.slice(0, 10) || "",
      assessedBy: s.assessed_by || "",
      notes: s.notes || "",
    });
    setShowForm(true);
  };

  const handleSave = () => {
    saveMutation.mutate({
      skillName: form.skillName,
      skillCategory: form.skillCategory,
      proficiencyLevel: form.proficiencyLevel,
      certifiedDate: form.certifiedDate || null,
      expiryDate: form.expiryDate || null,
      assessedBy: form.assessedBy || null,
      notes: form.notes || null,
    });
  };

  const filteredSkills = skills.filter(s => {
    if (search && !s.skill_name?.toLowerCase().includes(search.toLowerCase()) &&
        !s.skill_category?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const grouped: Record<string, SkillRow[]> = filteredSkills.reduce((acc, s) => {
    const cat = s.skill_category || "כללי";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(s);
    return acc;
  }, {} as Record<string, SkillRow[]>);

  const isStandalone = !employeeId;

  return (
    <div className={isStandalone ? "space-y-6 p-6" : "space-y-4"} dir="rtl">
      {isStandalone && (
        <>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Link href="/hr" className="flex items-center gap-1 hover:text-foreground transition-colors">
              <ChevronLeft className="w-4 h-4" />
              משאבי אנוש
            </Link>
            <span>/</span>
            <span className="text-foreground">מטריצת מיומנויות</span>
          </div>
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-3">
                <Award className="w-7 h-7 text-purple-400" />
                מטריצת מיומנויות
              </h1>
              <p className="text-muted-foreground mt-1">מפת כישורי ומיומנויות העובדים</p>
            </div>
          </div>

          {summary.length > 0 && (
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  סיכום ארגוני
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/30">
                        <th className="text-right py-2 pr-3 text-muted-foreground font-medium">מיומנות</th>
                        <th className="text-right py-2 px-3 text-muted-foreground font-medium">קטגוריה</th>
                        <th className="text-center py-2 px-3 text-muted-foreground font-medium">עובדים</th>
                        <th className="text-center py-2 px-3 text-muted-foreground font-medium">ממוצע</th>
                        <th className="text-center py-2 px-3 text-muted-foreground font-medium">מומחים</th>
                        <th className="text-center py-2 px-3 text-muted-foreground font-medium">מתחילים</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.slice(0, 20).map((row: any, i: number) => (
                        <tr key={i} className="border-b border-border/20 hover:bg-muted/10">
                          <td className="py-2 pr-3 font-medium text-foreground">{row.skill_name}</td>
                          <td className="py-2 px-3 text-muted-foreground">{row.skill_category || "—"}</td>
                          <td className="py-2 px-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Users className="w-3.5 h-3.5 text-muted-foreground" />
                              {row.employee_count}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-center">
                            <ProficiencyStars level={Math.round(parseFloat(row.avg_proficiency))} />
                          </td>
                          <td className="py-2 px-3 text-center text-purple-400 font-bold">{row.expert_count}</td>
                          <td className="py-2 px-3 text-center text-muted-foreground">{row.beginner_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="חיפוש מיומנות..."
            className="w-full pr-10 pl-4 py-2 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2 text-sm"
        >
          <option value="">כל הקטגוריות</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {isStandalone && (
          <input
            value={filterDept}
            onChange={e => setFilterDept(e.target.value)}
            placeholder="סנן לפי מחלקה..."
            className="bg-card border border-border rounded-xl px-3 py-2 text-sm min-w-[140px]"
          />
        )}
        {!readOnly && employeeId && (
          <>
            <button
              onClick={() => setShowGapAnalysis(v => !v)}
              className={`flex items-center gap-2 px-3 py-2 border rounded-xl text-sm font-medium transition-colors ${showGapAnalysis ? "bg-orange-500/20 border-orange-500/30 text-orange-400" : "bg-card border-border text-muted-foreground hover:text-foreground"}`}
            >
              <TrendingDown className="w-4 h-4" />
              פערים
            </button>
            <button onClick={() => setShowBulkForm(true)} className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground">
              <Upload className="w-4 h-4" />
              ייבוא מרובה
            </button>
            <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 mr-auto">
              <Plus className="w-4 h-4" />
              הוסף מיומנות
            </button>
          </>
        )}
        <span className="text-sm text-muted-foreground">{filteredSkills.length} מיומנויות</span>
      </div>

      {showGapAnalysis && gapAnalysis.length > 0 && (
        <Card className="border-orange-500/30 bg-orange-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-orange-400" />
              ניתוח פערים — מיומנויות נדרשות לתפקיד
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {gapAnalysis.map((gap: any, i: number) => {
                const hasGap = gap.gap > 0;
                const pct = Math.min(100, (gap.current_level / gap.required_level) * 100);
                return (
                  <div key={i} className={`p-3 rounded-xl border ${hasGap ? "border-orange-500/20 bg-orange-500/5" : "border-green-500/20 bg-green-500/5"}`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        {hasGap
                          ? <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
                          : <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                        }
                        <span className={`text-sm font-medium ${hasGap ? "text-orange-200" : "text-green-200"}`}>{gap.skill_name}</span>
                        {gap.skill_category && <Badge className="text-[10px] bg-muted/20 text-muted-foreground">{gap.skill_category}</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        <span className={hasGap ? "text-orange-400 font-bold" : "text-green-400 font-bold"}>{gap.current_level}</span>
                        <span> / {gap.required_level}</span>
                      </div>
                    </div>
                    <div className="w-full h-1.5 bg-muted/30 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${hasGap ? "bg-orange-400" : "bg-green-400"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {showGapAnalysis && gapAnalysis.length === 0 && (
        <div className="text-center py-6 text-muted-foreground bg-muted/10 rounded-xl border border-border/30">
          <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400 opacity-70" />
          <p className="text-sm">אין פרופיל דרישות לתפקיד זה</p>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Award className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>אין מיומנויות רשומות</p>
          {isStandalone && (
            <p className="text-xs mt-2 max-w-xs mx-auto leading-relaxed">
              כדי להוסיף מיומנויות לעובד ספציפי, כנס לפרופיל העובד ובחר בלשונית "מיומנויות"
            </p>
          )}
          {!readOnly && !isStandalone && <button onClick={openCreate} className="mt-3 px-4 py-2 bg-primary/20 text-primary rounded-xl text-sm">הוסף מיומנות ראשונה</button>}
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([category, catSkills]) => (
            <Card key={category} className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Layers className="w-4 h-4 text-primary" />
                  {category}
                  <Badge className="bg-primary/20 text-primary text-[10px]">{catSkills.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {catSkills.map(skill => {
                    const prof = PROFICIENCY_LABELS[skill.proficiency_level] || PROFICIENCY_LABELS[1];
                    return (
                      <div key={skill.id} className={`flex items-center gap-3 p-3 rounded-xl border border-border/30 ${prof.bg}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-foreground text-sm">{skill.skill_name}</span>
                            <Badge className={`text-[10px] ${prof.bg} ${prof.color} border-0`}>{prof.label}</Badge>
                          </div>
                          <div className="mt-1">
                            <ProficiencyStars level={skill.proficiency_level} />
                          </div>
                          {(skill.certified_date || skill.expiry_date) && (
                            <div className="text-[10px] text-muted-foreground mt-1">
                              {skill.certified_date && <span>הוסמך: {skill.certified_date.slice(0, 10)}</span>}
                              {skill.expiry_date && <span className="mr-2">תוקף: {skill.expiry_date.slice(0, 10)}</span>}
                            </div>
                          )}
                          {!employeeId && skill.employee_name && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              {skill.employee_name} • {skill.department}
                            </div>
                          )}
                        </div>
                        {!readOnly && (
                          <div className="flex gap-1 shrink-0">
                            <button onClick={() => openEdit(skill)} className="p-1.5 hover:bg-muted rounded-lg">
                              <Edit2 className="w-3.5 h-3.5 text-blue-400" />
                            </button>
                            <button onClick={() => deleteMutation.mutate(skill.id)} className="p-1.5 hover:bg-muted rounded-lg">
                              <Trash2 className="w-3.5 h-3.5 text-red-400" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h2 className="text-base font-bold text-foreground">{editingSkill ? "עריכת מיומנות" : "הוספת מיומנות"}</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-muted rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">שם המיומנות *</label>
                <input value={form.skillName || ""} onChange={e => setForm((f: any) => ({ ...f, skillName: e.target.value }))}
                  className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm" placeholder="לדוגמה: Excel, ריתוך MIG, Python" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">קטגוריה</label>
                <input value={form.skillCategory || ""} onChange={e => setForm((f: any) => ({ ...f, skillCategory: e.target.value }))}
                  className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm" placeholder="לדוגמה: מחשבים, ייצור, ניהול" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-2">רמת מיומנות</label>
                <div className="flex items-center gap-4">
                  <ProficiencyStars level={form.proficiencyLevel || 1} onChange={n => setForm((f: any) => ({ ...f, proficiencyLevel: n }))} />
                  <Badge className={`${PROFICIENCY_LABELS[form.proficiencyLevel]?.bg} ${PROFICIENCY_LABELS[form.proficiencyLevel]?.color}`}>
                    {PROFICIENCY_LABELS[form.proficiencyLevel]?.label}
                  </Badge>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">תאריך הסמכה</label>
                  <input type="date" value={form.certifiedDate || ""} onChange={e => setForm((f: any) => ({ ...f, certifiedDate: e.target.value }))}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">תוקף</label>
                  <input type="date" value={form.expiryDate || ""} onChange={e => setForm((f: any) => ({ ...f, expiryDate: e.target.value }))}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">הוערך על ידי</label>
                <input value={form.assessedBy || ""} onChange={e => setForm((f: any) => ({ ...f, assessedBy: e.target.value }))}
                  className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">ביטול</button>
              <button
                onClick={handleSave}
                disabled={!form.skillName || saveMutation.isPending}
                className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {saveMutation.isPending ? "שומר..." : "שמור"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulkForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowBulkForm(false)}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                <Upload className="w-4 h-4 text-primary" />
                ייבוא מיומנויות מרובה
              </h2>
              <button onClick={() => setShowBulkForm(false)} className="p-1.5 hover:bg-muted rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-muted-foreground">הזן כל מיומנות בשורה נפרדת בפורמט:</p>
              <code className="block text-xs bg-muted/30 p-2 rounded-lg text-primary">שם מיומנות, קטגוריה, רמה (1-5)</code>
              <p className="text-xs text-muted-foreground">דוגמה:</p>
              <code className="block text-xs bg-muted/30 p-2 rounded-lg text-muted-foreground whitespace-pre">Excel, מחשבים, 4{"\n"}ריתוך MIG, ייצור, 3{"\n"}ניהול צוות, ניהול, 2</code>
              <textarea
                value={bulkText}
                onChange={e => setBulkText(e.target.value)}
                rows={6}
                placeholder={"Excel, מחשבים, 4\nריתוך MIG, ייצור, 3"}
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm font-mono resize-none"
                dir="rtl"
              />
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2">
              <button onClick={() => setShowBulkForm(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">ביטול</button>
              <button
                onClick={handleBulkSave}
                disabled={!bulkText.trim() || bulkMutation.isPending}
                className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {bulkMutation.isPending ? "שומר..." : "ייבא מיומנויות"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
