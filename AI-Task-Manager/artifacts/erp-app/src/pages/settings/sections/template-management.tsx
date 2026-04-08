import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Button, Input, Label, Card } from "@/components/ui-components";
import { FileText, Plus, Trash2, Edit2, Copy, Search, Download, Eye, Star } from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";

interface Template {
  id: number;
  name: string;
  type: string;
  module: string;
  description: string;
  usageCount: number;
  isFavorite: boolean;
  lastModified: string;
}

const FALLBACK_INITIAL_TEMPLATES: Template[] = [
  { id: 1, name: "חשבונית מס רגילה", type: "document", module: "חשבוניות", description: "תבנית חשבונית מס עם כל השדות הסטנדרטיים", usageCount: 342, isFavorite: true, lastModified: "15/03/2026" },
  { id: 2, name: "הצעת מחיר מפורטת", type: "document", module: "הצעות מחיר", description: "הצעת מחיר עם תיאורים מפורטים, תמונות ותנאים", usageCount: 128, isFavorite: true, lastModified: "10/03/2026" },
  { id: 3, name: "תבנית לקוח חדש", type: "data", module: "לקוחות", description: "מבנה נתונים ברירת מחדל ללקוח חדש", usageCount: 89, isFavorite: false, lastModified: "01/03/2026" },
  { id: 4, name: "הסכם התקשרות", type: "document", module: "מסמכים", description: "תבנית הסכם סטנדרטי עם לקוח", usageCount: 45, isFavorite: false, lastModified: "20/02/2026" },
  { id: 5, name: "תזכורת תשלום", type: "email", module: "חשבוניות", description: "מייל תזכורת לתשלום חשבוניות פתוחות", usageCount: 213, isFavorite: true, lastModified: "12/03/2026" },
  { id: 6, name: "הזמנת רכש", type: "document", module: "רכש", description: "תבנית הזמנת רכש מספק", usageCount: 156, isFavorite: false, lastModified: "05/03/2026" },
  { id: 7, name: "חבילת Onboarding לקוח", type: "bundle", module: "לקוחות", description: "חבילת תבניות מלאה לקליטת לקוח חדש — חוזה, חשבונית, מייל ברוכים", usageCount: 34, isFavorite: true, lastModified: "17/03/2026" },
  { id: 8, name: "דוח חודשי", type: "report", module: "דוחות", description: "תבנית דוח ביצועים חודשי", usageCount: 67, isFavorite: false, lastModified: "01/03/2026" },
];

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  document: { label: "מסמך", color: "text-blue-400", bg: "bg-blue-500/10" },
  data: { label: "מבנה נתונים", color: "text-green-400", bg: "bg-green-500/10" },
  email: { label: "אימייל", color: "text-red-400", bg: "bg-red-500/10" },
  bundle: { label: "חבילה", color: "text-violet-400", bg: "bg-violet-500/10" },
  report: { label: "דוח", color: "text-amber-400", bg: "bg-amber-500/10" },
};

export default function TemplateManagementSection() {
  const { data: templatemanagementData } = useQuery({
    queryKey: ["template-management"],
    queryFn: () => authFetch("/api/settings/template_management"),
    staleTime: 5 * 60 * 1000,
  });

  const INITIAL_TEMPLATES = templatemanagementData ?? FALLBACK_INITIAL_TEMPLATES;

  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [templates, setTemplates] = useState<Template[]>(INITIAL_TEMPLATES);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterModule, setFilterModule] = useState("");
  const [activeTab, setActiveTab] = useState("templates");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ name: "", type: "document", module: "", description: "" });

  const tabs = [
    { id: "templates", label: "תבניות" },
    { id: "bundles", label: "חבילות" },
    { id: "settings", label: "הגדרות" },
  ];

  const filtered = templates.filter(t => {
    if (filterType && t.type !== filterType) return false;
    if (filterModule && t.module !== filterModule) return false;
    if (search) {
      const q = search.toLowerCase();
      return t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
    }
    return activeTab === "bundles" ? t.type === "bundle" : activeTab === "templates" ? t.type !== "bundle" : true;
  });

  const toggleFavorite = (id: number) => {
    setTemplates(prev => prev.map(t => t.id === id ? { ...t, isFavorite: !t.isFavorite } : t));
  };

  const deleteTemplate = async (id: number) => {
    if (await globalConfirm("למחוק תבנית זו?")) {
      setTemplates(prev => prev.filter(t => t.id !== id));
    }
  };

  const addTemplate = () => {
    if (!newTemplate.name) return;
    setTemplates(prev => [...prev, {
      ...newTemplate,
      id: Date.now(),
      usageCount: 0,
      isFavorite: false,
      lastModified: new Date().toLocaleDateString("he-IL"),
    }]);
    setNewTemplate({ name: "", type: "document", module: "", description: "" });
    setShowAddForm(false);
  };

  const uniqueModules = [...new Set(templates.map(t => t.module))];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center">
          <FileText className="w-5 h-5 text-emerald-500" />
        </div>
        <div>
          <h1 className="text-lg sm:text-2xl font-bold">תבניות וחבילות</h1>
          <p className="text-sm text-muted-foreground">ניהול תבניות מסמכים, חבילות ומבני נתונים</p>
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
            {tab.id === "bundles" && (
              <span className="mr-1.5 text-xs bg-violet-500/10 text-violet-400 px-1.5 py-0.5 rounded-full">
                {templates.filter(t => t.type === "bundle").length}
              </span>
            )}
          </button>
        ))}
      </div>

      {(activeTab === "templates" || activeTab === "bundles") && (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2 flex-1 max-w-sm">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="חפש תבנית..."
                className="bg-transparent text-sm outline-none flex-1"
              />
            </div>
            {activeTab === "templates" && (
              <select
                className="bg-background border border-border rounded-lg px-3 py-2 text-sm"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
              >
                <option value="">כל הסוגים</option>
                {Object.entries(TYPE_CONFIG).filter(([k]) => k !== "bundle").map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            )}
            <select
              className="bg-background border border-border rounded-lg px-3 py-2 text-sm"
              value={filterModule}
              onChange={(e) => setFilterModule(e.target.value)}
            >
              <option value="">כל המודולים</option>
              {uniqueModules.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <Button size="sm" className="gap-2" onClick={() => setShowAddForm(true)}>
              <Plus className="w-4 h-4" />
              {activeTab === "bundles" ? "חבילה חדשה" : "תבנית חדשה"}
            </Button>
          </div>

          {showAddForm && (
            <Card className="p-4 mb-4 border-primary/30">
              <h4 className="font-semibold mb-3">תבנית חדשה</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>שם התבנית</Label>
                  <Input value={newTemplate.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTemplate(p => ({ ...p, name: e.target.value }))} placeholder="שם התבנית" className="mt-1" />
                </div>
                <div>
                  <Label>סוג</Label>
                  <select
                    className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm"
                    value={newTemplate.type}
                    onChange={(e) => setNewTemplate(p => ({ ...p, type: e.target.value }))}
                  >
                    {Object.entries(TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <Label>מודול</Label>
                  <Input value={newTemplate.module} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTemplate(p => ({ ...p, module: e.target.value }))} placeholder="שם מודול" className="mt-1" />
                </div>
                <div>
                  <Label>תיאור</Label>
                  <Input value={newTemplate.description} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTemplate(p => ({ ...p, description: e.target.value }))} placeholder="תיאור קצר" className="mt-1" />
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <Button size="sm" onClick={addTemplate} disabled={!newTemplate.name} className="gap-1">
                  <Plus className="w-3.5 h-3.5" /> שמור
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowAddForm(false)}>ביטול</Button>
              </div>
            </Card>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filtered.map((template) => {
              const typeConfig = TYPE_CONFIG[template.type];
              return (
                <Card key={template.id} className="p-5 hover:border-primary/30 transition-all group">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${typeConfig.bg} ${typeConfig.color}`}>
                        {typeConfig.label}
                      </span>
                      <span className="text-xs text-muted-foreground bg-muted/30 px-2 py-0.5 rounded">{template.module}</span>
                    </div>
                    <button onClick={() => toggleFavorite(template.id)} className="text-muted-foreground hover:text-yellow-400 transition-colors">
                      <Star className={`w-4 h-4 ${template.isFavorite ? "fill-yellow-400 text-yellow-400" : ""}`} />
                    </button>
                  </div>

                  <h4 className="font-semibold mb-1">{template.name}</h4>
                  <p className="text-xs text-muted-foreground mb-3">{template.description}</p>

                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-muted-foreground">שימוש: {template.usageCount} פעמים</span>
                    <span className="text-xs text-muted-foreground">עודכן: {template.lastModified}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="flex-1 gap-1 text-xs">
                      <Eye className="w-3 h-3" />
                      תצוגה
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1 text-xs">
                      <Edit2 className="w-3 h-3" />
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1 text-xs">
                      <Copy className="w-3 h-3" />
                    </Button>
                    <button onClick={() => deleteTemplate(template.id)} className="p-1.5 hover:bg-red-500/10 rounded border border-transparent hover:border-red-500/20 transition-colors">
                      <Trash2 className="w-3 h-3 text-red-400" />
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>לא נמצאו תבניות</p>
            </div>
          )}
        </>
      )}

      {activeTab === "settings" && (
        <Card className="p-3 sm:p-6">
          <h3 className="text-lg font-semibold mb-4">הגדרות תבניות</h3>
          <div className="space-y-3">
            {[
              { label: "שמירה אוטומטית של גרסאות", desc: "שמור גרסה קודמת בכל עדכון תבנית", enabled: true },
              { label: "אפשר שיתוף תבניות בין משתמשים", desc: "משתמשים יכולים לשתף תבניות", enabled: true },
              { label: "כלול לוגו חברה אוטומטית", desc: "הוסף לוגו החברה לכל תבנית מסמך", enabled: true },
              { label: "הצג תצוגה מקדימה בפניה", desc: "הצג תצוגה מקדימה לפני שמירת מסמך", enabled: false },
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
              <FileText className="w-4 h-4" />
              שמור הגדרות
            </Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="template-management" />
        <RelatedRecords entityType="template-management" />
      </div>
    </div>
  );
}
