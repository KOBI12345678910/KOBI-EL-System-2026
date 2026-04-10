import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Button, Input, Label, Card } from "@/components/ui-components";
import {
  BookOpen, CheckCircle2, Circle, Plus, Trash2, Save, ToggleLeft, ToggleRight,
  Code2, AlertTriangle, Wrench, BarChart3, Camera, ShoppingBag,
  Users, Trophy, Clock, X, ChevronDown, ChevronUp, Filter, GraduationCap,
  Star, TrendingUp, Search
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import { motion, AnimatePresence } from "framer-motion";

interface OnboardingStep {
  id: number;
  title: string;
  description: string;
  completed: boolean;
  required: boolean;
}

interface TrackStep {
  id: number;
  title: string;
  description: string;
  completed: boolean;
  required: boolean;
}

interface TrainingTrack {
  id: number;
  title: string;
  description: string;
  category: string;
  steps: TrackStep[];
  duration: string;
  level: "beginner" | "intermediate" | "advanced";
  active: boolean;
  participants: number;
}

const CATEGORIES = [
  { id: "programming", label: "תכנות", icon: Code2, color: "bg-blue-500/10 text-blue-500 border-blue-500/20", iconBg: "bg-blue-500/15", iconColor: "text-blue-500" },
  { id: "emergency", label: "חירום", icon: AlertTriangle, color: "bg-red-500/10 text-red-500 border-red-500/20", iconBg: "bg-red-500/15", iconColor: "text-red-500" },
  { id: "maintenance", label: "תחזוקה", icon: Wrench, color: "bg-orange-500/10 text-orange-500 border-orange-500/20", iconBg: "bg-orange-500/15", iconColor: "text-orange-500" },
  { id: "management", label: "ניהול/ייצור", icon: BarChart3, color: "bg-purple-500/10 text-purple-500 border-purple-500/20", iconBg: "bg-purple-500/15", iconColor: "text-purple-500" },
  { id: "photography", label: "תמנות", icon: Camera, color: "bg-green-500/10 text-green-500 border-green-500/20", iconBg: "bg-green-500/15", iconColor: "text-green-500" },
  { id: "store", label: "חנות", icon: ShoppingBag, color: "bg-amber-500/10 text-amber-500 border-amber-500/20", iconBg: "bg-amber-500/15", iconColor: "text-amber-500" },
];

const FALLBACK_INITIAL_CHECKLIST: OnboardingStep[] = [
  { id: 1, title: "הגדרת פרטי החברה", description: "מלא את פרטי החברה הבסיסיים — שם, כתובת, לוגו", completed: true, required: true },
  { id: 2, title: "הוסף משתמש ראשון", description: "צור חשבון משתמש לעמית צוות ראשון", completed: true, required: true },
  { id: 3, title: "חבר אינטגרציה ראשונה", description: "חבר את המערכת ל-Gmail, WhatsApp או שירות חיצוני", completed: false, required: false },
  { id: 4, title: "יצור מודול מותאם", description: "הגדר מודול ראשון בהתאם לצרכי העסק שלך", completed: false, required: false },
  { id: 5, title: "הגדר אוטומציה ראשונה", description: "צור כלל אוטומציה שיחסוך לך זמן יקר", completed: false, required: false },
  { id: 6, title: "ייצא דוח ראשון", description: "ייצא נתונים ל-Excel או PDF", completed: false, required: false },
];

const FALLBACK_INITIAL_TRACKS: TrainingTrack[] = [
  {
    id: 1, title: "Python בסיסי", description: "מבוא לשפת Python, משתנים, לולאות ופונקציות",
    category: "programming", duration: "4 שעות", level: "beginner", active: true, participants: 8,
    steps: [
      { id: 1, title: "התקנת סביבת Python", description: "התקנה והגדרה", completed: true, required: true },
      { id: 2, title: "משתנים וסוגי נתונים", description: "int, str, list, dict", completed: true, required: true },
      { id: 3, title: "לולאות ותנאים", description: "for, while, if/else", completed: false, required: true },
      { id: 4, title: "פונקציות ומודולים", description: "def, import", completed: false, required: false },
    ]
  },
  {
    id: 2, title: "נהלי חירום בשריפה", description: "נהלי פינוי ועזרה ראשונה במקרה שריפה",
    category: "emergency", duration: "2 שעות", level: "beginner", active: true, participants: 12,
    steps: [
      { id: 1, title: "זיהוי מקור האש", description: "סימנים ראשוניים", completed: true, required: true },
      { id: 2, title: "הפעלת אזעקה", description: "כפתורי חירום", completed: true, required: true },
      { id: 3, title: "נהלי פינוי", description: "מסלולי בריחה", completed: true, required: true },
      { id: 4, title: "עזרה ראשונה", description: "CPR ופציעות", completed: true, required: false },
    ]
  },
  {
    id: 3, title: "תחזוקה מונעת למכונות", description: "בדיקות תקופתיות ושמירה על ציוד",
    category: "maintenance", duration: "3 שעות", level: "intermediate", active: true, participants: 5,
    steps: [
      { id: 1, title: "בדיקה יומית", description: "רשימת בדיקות יומית", completed: true, required: true },
      { id: 2, title: "שימון וניקוי", description: "פרוצדורת שימון", completed: false, required: true },
      { id: 3, title: "בדיקה חודשית", description: "בדיקה מקיפה", completed: false, required: false },
    ]
  },
  {
    id: 4, title: "ניהול תהליכי ייצור", description: "אופטימיזציה ופיקוח על קווי ייצור",
    category: "management", duration: "5 שעות", level: "advanced", active: false, participants: 3,
    steps: [
      { id: 1, title: "מיפוי תהליכים", description: "ניתוח ומיפוי", completed: false, required: true },
      { id: 2, title: "הגדרת KPI", description: "מדדי ביצוע", completed: false, required: true },
    ]
  },
  {
    id: 5, title: "צילום מוצרים", description: "טכניקות צילום מקצועי לאתר הסחר",
    category: "photography", duration: "2 שעות", level: "beginner", active: true, participants: 3,
    steps: [
      { id: 1, title: "הכנת ציוד", description: "מצלמה, תאורה, רקע", completed: true, required: true },
      { id: 2, title: "תאורה נכונה", description: "אור טבעי ומלאכותי", completed: true, required: true },
      { id: 3, title: "עריכה בסיסית", description: "Lightroom/Photoshop", completed: false, required: false },
    ]
  },
  {
    id: 6, title: "ניהול קופה וחנות", description: "הפעלת מערכת קופה, מלאי ושירות לקוחות",
    category: "store", duration: "2 שעות", level: "beginner", active: false, participants: 7,
    steps: [
      { id: 1, title: "פתיחת יום קופה", description: "אתחול קופה יומי", completed: true, required: true },
      { id: 2, title: "הנפקת חשבונית", description: "יצירת חשבונית מס", completed: true, required: true },
      { id: 3, title: "ניהול מלאי", description: "ספירה ועדכון", completed: true, required: false },
      { id: 4, title: "סגירת קופה", description: "ספירת קופה וסיכום", completed: true, required: true },
    ]
  },
];

const LEVEL_MAP: Record<string, { label: string; color: string }> = {
  beginner: { label: "מתחילים", color: "bg-green-100 text-green-700" },
  intermediate: { label: "מתקדמים", color: "bg-blue-100 text-blue-700" },
  advanced: { label: "מומחים", color: "bg-purple-100 text-purple-700" },
};

export default function OnboardingCenterSection() {
  const { data: onboardingcenterData } = useQuery({
    queryKey: ["onboarding-center"],
    queryFn: () => authFetch("/api/settings/onboarding_center"),
    staleTime: 5 * 60 * 1000,
  });

  const INITIAL_CHECKLIST = onboardingcenterData ?? FALLBACK_INITIAL_CHECKLIST;
  const INITIAL_TRACKS = FALLBACK_INITIAL_TRACKS;

  const [tracks, setTracks] = useState<TrainingTrack[]>(INITIAL_TRACKS);
  const [checklist, setChecklist] = useState<OnboardingStep[]>(INITIAL_CHECKLIST);
  const [enabled, setEnabled] = useState(true);
  const [activeTab, setActiveTab] = useState("tracks");

  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [expandedTrack, setExpandedTrack] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [showAddTrackForm, setShowAddTrackForm] = useState(false);
  const [newTrack, setNewTrack] = useState<Partial<TrainingTrack>>({
    category: "programming", level: "beginner", active: true, steps: [], participants: 0, duration: ""
  });
  const [newTrackSteps, setNewTrackSteps] = useState<string[]>([""]);

  const [showAddChecklistStep, setShowAddChecklistStep] = useState(false);
  const [newChecklistStep, setNewChecklistStep] = useState({ title: "", description: "", required: false });

  const tabs = [
    { id: "tracks", label: "מסלולי הכשרה" },
    { id: "checklist", label: "צ'קליסט" },
    { id: "settings", label: "הגדרות" },
    { id: "stats", label: "סטטיסטיקות" },
  ];

  const filteredTracks = useMemo(() => {
    return tracks.filter(t =>
      (filterCategory === "all" || t.category === filterCategory) &&
      (!search || t.title.includes(search) || t.description.includes(search))
    );
  }, [tracks, filterCategory, search]);

  const getCategoryCount = (catId: string) => tracks.filter(t => t.category === catId).length;

  const globalStats = useMemo(() => {
    const activeTracks = tracks.filter(t => t.active).length;
    const totalSteps = tracks.reduce((s, t) => s + t.steps.length, 0);
    const completedSteps = tracks.reduce((s, t) => s + t.steps.filter(st => st.completed).length, 0);
    const totalParticipants = tracks.reduce((s, t) => s + t.participants, 0);
    return { activeTracks, totalSteps, completedSteps, totalParticipants, completedTracks: tracks.filter(t => !t.active).length };
  }, [tracks]);

  const checklistCompletedCount = checklist.filter(s => s.completed).length;
  const checklistProgress = Math.round((checklistCompletedCount / checklist.length) * 100);

  const toggleTrackStep = (trackId: number, stepId: number) => {
    setTracks(prev => prev.map(t => t.id === trackId
      ? { ...t, steps: t.steps.map(s => s.id === stepId ? { ...s, completed: !s.completed } : s) }
      : t
    ));
  };

  const toggleTrackActive = (trackId: number) => {
    setTracks(prev => prev.map(t => t.id === trackId ? { ...t, active: !t.active } : t));
  };

  const deleteTrack = (trackId: number) => {
    setTracks(prev => prev.filter(t => t.id !== trackId));
  };

  const addTrack = () => {
    if (!newTrack.title) return;
    const steps: TrackStep[] = newTrackSteps
      .filter(s => s.trim())
      .map((title, i) => ({ id: i + 1, title: title.trim(), description: "", completed: false, required: false }));
    setTracks(prev => [...prev, { ...newTrack, id: Date.now(), steps, participants: 0 } as TrainingTrack]);
    setNewTrack({ category: "programming", level: "beginner", active: true, steps: [], participants: 0, duration: "" });
    setNewTrackSteps([""]);
    setShowAddTrackForm(false);
  };

  const toggleCategory = (catId: string) => {
    setExpandedCategories(prev => ({ ...prev, [catId]: !prev[catId] }));
  };

  const toggleChecklistStep = (id: number) => {
    setChecklist(prev => prev.map(s => s.id === id ? { ...s, completed: !s.completed } : s));
  };

  const deleteChecklistStep = (id: number) => {
    setChecklist(prev => prev.filter(s => s.id !== id));
  };

  const addChecklistStep = () => {
    if (!newChecklistStep.title) return;
    setChecklist(prev => [...prev, { ...newChecklistStep, id: Date.now(), completed: false }]);
    setNewChecklistStep({ title: "", description: "", required: false });
    setShowAddChecklistStep(false);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg">
            <GraduationCap className="w-6 h-6 text-foreground" />
          </div>
          <div>
            <h1 className="text-lg sm:text-2xl font-bold">Onboarding Center</h1>
            <p className="text-sm text-muted-foreground">מרכז הדרכה מקיף — מסלולי הכשרה, קטגוריות, מעקב התקדמות</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">הפעלת Onboarding</span>
          <button onClick={() => setEnabled(!enabled)} className="text-primary">
            {enabled ? <ToggleRight className="w-8 h-8 text-primary" /> : <ToggleLeft className="w-8 h-8 text-muted-foreground" />}
          </button>
        </div>
      </div>

      <div className="flex gap-1 mb-6 border-b border-border overflow-x-auto pb-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "tracks" && (
        <div className="space-y-4 sm:space-y-6">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const count = getCategoryCount(cat.id);
              const isExpanded = !!expandedCategories[cat.id];
              return (
                <button
                  key={cat.id}
                  onClick={() => toggleCategory(cat.id)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${cat.color} hover:opacity-90 ${isExpanded ? "ring-2 ring-current ring-offset-1 ring-offset-background" : ""}`}
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${cat.iconBg}`}>
                    <Icon className={`w-5 h-5 ${cat.iconColor}`} />
                  </div>
                  <span className="text-xs font-semibold">{cat.label}</span>
                  <span className="text-lg font-bold">{count}</span>
                  {isExpanded ? <ChevronUp className="w-3 h-3 opacity-60" /> : <ChevronDown className="w-3 h-3 opacity-60" />}
                </button>
              );
            })}
          </div>

          {CATEGORIES.some(c => expandedCategories[c.id]) && (
            <div className="space-y-2">
              {CATEGORIES.filter(c => expandedCategories[c.id]).map(cat => {
                const Icon = cat.icon;
                const catTracks = tracks.filter(t => t.category === cat.id);
                return (
                  <div key={cat.id} className={`rounded-xl border p-3 ${cat.color}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className={`w-4 h-4 ${cat.iconColor}`} />
                      <span className="font-semibold text-sm">{cat.label}</span>
                      <span className="text-xs opacity-60">({catTracks.length} מסלולים)</span>
                    </div>
                    {catTracks.length === 0 ? (
                      <p className="text-xs opacity-60">אין מסלולים בקטגוריה זו</p>
                    ) : (
                      <div className="space-y-1">
                        {catTracks.map(t => {
                          const completedSteps = t.steps.filter(s => s.completed).length;
                          const prog = t.steps.length > 0 ? Math.round((completedSteps / t.steps.length) * 100) : 0;
                          return (
                            <div key={t.id} className="flex items-center justify-between bg-background/40 rounded-lg px-3 py-1.5 text-xs">
                              <span className="font-medium">{t.title}</span>
                              <span className="opacity-70">{t.steps.length} שלבים · {prog}%</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                <Clock className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-lg sm:text-2xl font-bold text-blue-500">{globalStats.activeTracks}</p>
                <p className="text-xs text-muted-foreground">מסלולים פעילים</p>
              </div>
            </Card>
            <Card className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center flex-shrink-0">
                <Trophy className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-lg sm:text-2xl font-bold text-green-500">
                  {globalStats.totalSteps > 0 ? Math.round((globalStats.completedSteps / globalStats.totalSteps) * 100) : 0}%
                </p>
                <p className="text-xs text-muted-foreground">שלבים הושלמו</p>
              </div>
            </Card>
            <Card className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                <Users className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <p className="text-lg sm:text-2xl font-bold text-purple-500">{globalStats.totalParticipants}</p>
                <p className="text-xs text-muted-foreground">משתתפים סה"כ</p>
              </div>
            </Card>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="חיפוש מסלול..."
                className="w-full border border-input rounded-lg pr-9 pl-3 py-2 text-sm bg-background"
              />
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <button
                onClick={() => setFilterCategory("all")}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${filterCategory === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
              >
                הכל ({tracks.length})
              </button>
              {CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setFilterCategory(cat.id)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${filterCategory === cat.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                >
                  {cat.label} ({getCategoryCount(cat.id)})
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowAddTrackForm(true)}
              className="bg-gradient-to-r from-amber-500 to-orange-600 text-foreground px-4 py-2 rounded-xl flex items-center gap-2 hover:opacity-90 transition shadow-md text-sm flex-shrink-0"
            >
              <Plus className="w-4 h-4" /> מסלול חדש
            </button>
          </div>

          <AnimatePresence>
            {showAddTrackForm && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <Card className="p-4 border-primary/30">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold">מסלול הכשרה חדש</h4>
                    <button onClick={() => setShowAddTrackForm(false)} className="p-1 hover:bg-muted rounded">
                      <X className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <Label>שם המסלול</Label>
                      <Input
                        value={newTrack.title || ""}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTrack(p => ({ ...p, title: e.target.value }))}
                        placeholder="לדוגמה: הכשרת מנהל ייצור"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label>תיאור</Label>
                      <Input
                        value={newTrack.description || ""}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTrack(p => ({ ...p, description: e.target.value }))}
                        placeholder="תיאור קצר של המסלול"
                        className="mt-1"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <Label>קטגוריה</Label>
                        <select
                          value={newTrack.category || "programming"}
                          onChange={(e) => setNewTrack(p => ({ ...p, category: e.target.value }))}
                          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                          {CATEGORIES.map(cat => <option key={cat.id} value={cat.id}>{cat.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <Label>רמה</Label>
                        <select
                          value={newTrack.level || "beginner"}
                          onChange={(e) => setNewTrack(p => ({ ...p, level: e.target.value as "beginner" | "intermediate" | "advanced" }))}
                          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                          <option value="beginner">מתחילים</option>
                          <option value="intermediate">מתקדמים</option>
                          <option value="advanced">מומחים</option>
                        </select>
                      </div>
                      <div>
                        <Label>משך זמן</Label>
                        <Input
                          value={newTrack.duration || ""}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTrack(p => ({ ...p, duration: e.target.value }))}
                          placeholder="לדוגמה: 3 שעות"
                          className="mt-1"
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <Label>שלבי המסלול</Label>
                        <button
                          type="button"
                          onClick={() => setNewTrackSteps(prev => [...prev, ""])}
                          className="text-xs text-primary flex items-center gap-1 hover:underline"
                        >
                          <Plus className="w-3 h-3" /> הוסף שלב
                        </button>
                      </div>
                      <div className="space-y-2">
                        {newTrackSteps.map((step, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-5 flex-shrink-0">{idx + 1}.</span>
                            <Input
                              value={step}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                setNewTrackSteps(prev => prev.map((s, i) => i === idx ? e.target.value : s))
                              }
                              placeholder={`שלב ${idx + 1}`}
                              className="flex-1 h-8 text-sm"
                            />
                            {newTrackSteps.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setNewTrackSteps(prev => prev.filter((_, i) => i !== idx))}
                                className="p-1 hover:bg-red-500/10 rounded flex-shrink-0"
                              >
                                <X className="w-3.5 h-3.5 text-red-400" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={addTrack}
                      disabled={!newTrack.title}
                      className="flex-1 bg-amber-600 text-foreground rounded-lg py-2 hover:bg-amber-700 disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                    >
                      <Save className="w-4 h-4" /> צור מסלול
                    </button>
                    <button
                      onClick={() => { setShowAddTrackForm(false); setNewTrackSteps([""]); }}
                      className="flex-1 border rounded-lg py-2 hover:bg-muted text-sm"
                    >
                      ביטול
                    </button>
                  </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-3">
            {filteredTracks.length === 0 && (
              <div className="text-center py-10 text-muted-foreground text-sm">אין מסלולי הכשרה תואמים</div>
            )}
            {filteredTracks.map((track) => {
              const cat = CATEGORIES.find(c => c.id === track.category);
              const Icon = cat?.icon ?? BookOpen;
              const completedSteps = track.steps.filter(s => s.completed).length;
              const trackProgress = track.steps.length > 0 ? Math.round((completedSteps / track.steps.length) * 100) : 0;
              const isExpanded = expandedTrack === track.id;
              return (
                <motion.div key={track.id} layout>
                  <Card className={`overflow-hidden transition-all ${!track.active ? "opacity-60" : ""}`}>
                    <div
                      className="p-4 flex items-start gap-3 cursor-pointer"
                      onClick={() => setExpandedTrack(isExpanded ? null : track.id)}
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${cat?.iconBg ?? "bg-muted"}`}>
                        <Icon className={`w-5 h-5 ${cat?.iconColor ?? "text-muted-foreground"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h4 className="font-semibold text-sm">{track.title}</h4>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${LEVEL_MAP[track.level]?.color}`}>
                            {LEVEL_MAP[track.level]?.label}
                          </span>
                          {track.active
                            ? <span className="text-xs bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded-full font-medium">פעיל</span>
                            : <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium">לא פעיל</span>
                          }
                          <span className="text-xs text-muted-foreground">{cat?.label}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">{track.description}</p>
                        <div className="flex items-center gap-4">
                          <div className="flex-1 max-w-40">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-muted-foreground">התקדמות</span>
                              <span className="text-xs font-medium">{trackProgress}%</span>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${trackProgress}%` }} />
                            </div>
                          </div>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Users className="w-3 h-3" /> {track.participants}
                          </span>
                          {track.duration && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="w-3 h-3" /> {track.duration}
                            </span>
                          )}
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground mr-auto" /> : <ChevronDown className="w-4 h-4 text-muted-foreground mr-auto" />}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => toggleTrackActive(track.id)}
                          className="p-1.5 hover:bg-muted rounded text-xs"
                          title={track.active ? "השבת" : "הפעל"}
                        >
                          {track.active ? <Star className="w-3.5 h-3.5 text-amber-500" /> : <Star className="w-3.5 h-3.5 text-muted-foreground" />}
                        </button>
                        <button onClick={() => deleteTrack(track.id)} className="p-1.5 hover:bg-red-500/10 rounded">
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </div>
                    </div>
                    <AnimatePresence>
                      {isExpanded && track.steps.length > 0 && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-4 border-t border-border pt-3 space-y-2">
                            <p className="text-xs font-medium text-muted-foreground mb-2">שלבי המסלול ({completedSteps}/{track.steps.length})</p>
                            {track.steps.map(step => (
                              <div
                                key={step.id}
                                className="flex items-center gap-3 cursor-pointer group"
                                onClick={() => toggleTrackStep(track.id, step.id)}
                              >
                                {step.completed
                                  ? <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                                  : <Circle className="w-4 h-4 text-muted-foreground flex-shrink-0 group-hover:text-primary" />
                                }
                                <span className={`text-xs ${step.completed ? "line-through text-muted-foreground" : ""}`}>{step.title}</span>
                                {step.required && <span className="text-xs bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded mr-auto">חובה</span>}
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === "checklist" && (
        <div className="space-y-4">
          <Card className="p-3 sm:p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">התקדמות כוללת</h3>
              <span className="text-sm font-bold text-primary">{checklistCompletedCount}/{checklist.length} שלבים הושלמו</span>
            </div>
            <div className="w-full bg-muted rounded-full h-3 mb-2">
              <div className="bg-primary h-3 rounded-full transition-all duration-500" style={{ width: `${checklistProgress}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">{checklistProgress}% הושלם</p>
          </Card>

          <div className="flex items-center justify-between">
            <h3 className="font-semibold">שלבי Onboarding</h3>
            <Button size="sm" className="gap-2" onClick={() => setShowAddChecklistStep(true)}>
              <Plus className="w-4 h-4" /> הוסף שלב
            </Button>
          </div>

          {showAddChecklistStep && (
            <Card className="p-4 border-primary/30">
              <h4 className="font-medium mb-3">שלב חדש</h4>
              <div className="space-y-3">
                <div>
                  <Label>כותרת</Label>
                  <Input value={newChecklistStep.title} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewChecklistStep(p => ({ ...p, title: e.target.value }))} placeholder="כותרת השלב" className="mt-1" />
                </div>
                <div>
                  <Label>תיאור</Label>
                  <Input value={newChecklistStep.description} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewChecklistStep(p => ({ ...p, description: e.target.value }))} placeholder="תיאור קצר של השלב" className="mt-1" />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={newChecklistStep.required} onChange={(e) => setNewChecklistStep(p => ({ ...p, required: e.target.checked }))} />
                  <span className="text-sm">שלב חובה</span>
                </label>
              </div>
              <div className="flex gap-2 mt-3">
                <Button size="sm" onClick={addChecklistStep} disabled={!newChecklistStep.title} className="gap-1">
                  <Save className="w-3.5 h-3.5" /> שמור
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowAddChecklistStep(false)}>ביטול</Button>
              </div>
            </Card>
          )}

          <div className="space-y-3">
            {checklist.map((step, i) => (
              <Card key={step.id} className={`p-4 flex items-center gap-4 transition-all ${step.completed ? "opacity-75" : ""}`}>
                <button onClick={() => toggleChecklistStep(step.id)} className="flex-shrink-0">
                  {step.completed
                    ? <CheckCircle2 className="w-6 h-6 text-green-400" />
                    : <Circle className="w-6 h-6 text-muted-foreground" />
                  }
                </button>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className={`font-medium text-sm ${step.completed ? "line-through text-muted-foreground" : ""}`}>
                      {i + 1}. {step.title}
                    </h4>
                    {step.required && <span className="text-xs bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded">חובה</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                </div>
                <button onClick={() => deleteChecklistStep(step.id)} className="p-1 hover:bg-red-500/10 rounded flex-shrink-0">
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                </button>
              </Card>
            ))}
          </div>
        </div>
      )}

      {activeTab === "settings" && (
        <div className="space-y-4">
          <Card className="p-3 sm:p-6">
            <h3 className="text-lg font-semibold mb-4">הגדרות Onboarding</h3>
            <div className="space-y-3">
              {[
                { label: "הצג Onboarding למשתמשים חדשים", desc: "הצג אשף הגדרה בכניסה ראשונה", enabled: enabled },
                { label: "אפשר דילוג על שלבים", desc: "משתמשים יוכלו לדלג על שלבים אופציונליים", enabled: true },
                { label: "שלח תזכורות במייל", desc: "שלח תזכורת על שלבים שלא הושלמו", enabled: false },
                { label: "הצג פס התקדמות", desc: "הצג פס התקדמות בסייד-בר", enabled: true },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div>
                    <p className="font-medium text-sm">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" defaultChecked={item.enabled} />
                    <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:bg-primary transition-colors after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-card after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-[-20px]" />
                  </label>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <Button className="gap-2">
                <Save className="w-4 h-4" /> שמור הגדרות
              </Button>
            </div>
          </Card>
        </div>
      )}

      {activeTab === "stats" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { label: "משתמשים שסיימו Onboarding", value: "24", sub: "מתוך 38 משתמשים", color: "text-green-400", icon: Trophy },
            { label: "זמן ממוצע להשלמה", value: "3.2 ימים", sub: "מאז הרשמה עד השלמה", color: "text-blue-400", icon: Clock },
            { label: "שלב נפוץ לנטישה", value: "שלב 4", sub: "יצירת מודול מותאם", color: "text-yellow-400", icon: TrendingUp },
            { label: "אחוז השלמה", value: "63%", sub: "ממשתמשים שהתחילו", color: "text-primary", icon: Star },
          ].map((stat, i) => {
            const Icon = stat.icon;
            return (
              <Card key={i} className="p-5">
                <div className="flex items-start justify-between mb-2">
                  <p className={`text-xl sm:text-3xl font-bold ${stat.color}`}>{stat.value}</p>
                  <Icon className={`w-5 h-5 ${stat.color} opacity-60`} />
                </div>
                <p className="font-medium text-sm mb-1">{stat.label}</p>
                <p className="text-xs text-muted-foreground">{stat.sub}</p>
              </Card>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="onboarding" />
        <RelatedRecords entityType="onboarding" />
      </div>
    </div>
  );
}
