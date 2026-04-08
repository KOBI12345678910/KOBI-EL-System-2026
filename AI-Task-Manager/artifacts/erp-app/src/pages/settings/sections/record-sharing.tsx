import { useState } from "react";
import { Button, Input, Label, Card } from "@/components/ui-components";
import { Share2, Plus, Trash2, Save, Users, Check, X } from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";

const SHARING_RULES = [
  { id: 1, module: "לקוחות", condition: "נציג = המשתמש הנוכחי", sharedWith: "מנהל מכירות", access: "קריאה/כתיבה" },
  { id: 2, module: "הזמנות", condition: "אזור = צפון", sharedWith: "צוות צפון", access: "קריאה בלבד" },
  { id: 3, module: "חשבוניות", condition: "סכום > 10,000", sharedWith: "מנהל כספים", access: "קריאה/כתיבה" },
  { id: 4, module: "ספקים", condition: "קטגוריה = IT", sharedWith: "מחלקת IT", access: "קריאה בלבד" },
];

export default function RecordSharingSection() {
  const [rules, setRules] = useState(SHARING_RULES);
  const [activeTab, setActiveTab] = useState("rules");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newRule, setNewRule] = useState({ module: "", condition: "", sharedWith: "", access: "קריאה בלבד" });

  const tabs = [
    { id: "rules", label: "כללי שיתוף" },
    { id: "manual", label: "שיתוף ידני" },
    { id: "settings", label: "הגדרות" },
  ];

  const addRule = () => {
    if (!newRule.module || !newRule.sharedWith) return;
    setRules(prev => [...prev, { ...newRule, id: Date.now() }]);
    setNewRule({ module: "", condition: "", sharedWith: "", access: "קריאה בלבד" });
    setShowAddForm(false);
  };

  const deleteRule = (id: number) => {
    setRules(prev => prev.filter(r => r.id !== id));
  };

  const MODULES = ["לקוחות", "הזמנות", "חשבוניות", "ספקים", "מוצרים", "דוחות"];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500/20 to-cyan-500/20 flex items-center justify-center">
          <Share2 className="w-5 h-5 text-teal-500" />
        </div>
        <div>
          <h1 className="text-lg sm:text-2xl font-bold">Record Sharing</h1>
          <p className="text-sm text-muted-foreground">שיתוף רשומות בין משתמשים וצוותים — כללי שיתוף אוטומטי והרשאות</p>
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

      {activeTab === "rules" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">כללי שיתוף אוטומטי</h3>
            <Button size="sm" className="gap-2" onClick={() => setShowAddForm(true)}>
              <Plus className="w-4 h-4" />
              כלל חדש
            </Button>
          </div>

          {showAddForm && (
            <Card className="p-4 border-primary/30">
              <h4 className="font-semibold mb-3">כלל שיתוף חדש</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>מודול</Label>
                  <select
                    className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm"
                    value={newRule.module}
                    onChange={(e) => setNewRule(p => ({ ...p, module: e.target.value }))}
                  >
                    <option value="">בחר מודול...</option>
                    {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <Label>תנאי שיתוף</Label>
                  <Input value={newRule.condition} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewRule(p => ({ ...p, condition: e.target.value }))} placeholder="לדוג': אזור = צפון" className="mt-1" />
                </div>
                <div>
                  <Label>שתף עם</Label>
                  <Input value={newRule.sharedWith} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewRule(p => ({ ...p, sharedWith: e.target.value }))} placeholder="שם משתמש, קבוצה או תפקיד" className="mt-1" />
                </div>
                <div>
                  <Label>רמת גישה</Label>
                  <select
                    className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm"
                    value={newRule.access}
                    onChange={(e) => setNewRule(p => ({ ...p, access: e.target.value }))}
                  >
                    <option value="קריאה בלבד">קריאה בלבד</option>
                    <option value="קריאה/כתיבה">קריאה/כתיבה</option>
                    <option value="ניהול מלא">ניהול מלא</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <Button size="sm" onClick={addRule} disabled={!newRule.module || !newRule.sharedWith} className="gap-1">
                  <Check className="w-3.5 h-3.5" /> שמור
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowAddForm(false)} className="gap-1">
                  <X className="w-3.5 h-3.5" /> ביטול
                </Button>
              </div>
            </Card>
          )}

          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-right p-3 font-medium text-xs text-muted-foreground">מודול</th>
                  <th className="text-right p-3 font-medium text-xs text-muted-foreground">תנאי</th>
                  <th className="text-right p-3 font-medium text-xs text-muted-foreground">שתף עם</th>
                  <th className="text-right p-3 font-medium text-xs text-muted-foreground">גישה</th>
                  <th className="text-right p-3 font-medium text-xs text-muted-foreground">מחק</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id} className="border-b border-border hover:bg-muted/20">
                    <td className="p-3">
                      <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">{rule.module}</span>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">{rule.condition || "—"}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-sm">{rule.sharedWith}</span>
                      </div>
                    </td>
                    <td className="p-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        rule.access === "ניהול מלא" ? "bg-red-500/10 text-red-400" :
                        rule.access === "קריאה/כתיבה" ? "bg-blue-500/10 text-blue-400" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {rule.access}
                      </span>
                    </td>
                    <td className="p-3">
                      <button onClick={() => deleteRule(rule.id)} className="p-1 hover:bg-red-500/10 rounded">
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {activeTab === "manual" && (
        <Card className="p-3 sm:p-6">
          <h3 className="text-lg font-semibold mb-4">שיתוף ידני של רשומות</h3>
          <p className="text-sm text-muted-foreground mb-4">חפש רשומה ספציפית ושתף אותה עם משתמש או קבוצה</p>
          <div className="grid grid-cols-2 gap-4 max-w-lg">
            <div>
              <Label>מודול</Label>
              <select className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm">
                <option value="">בחר מודול...</option>
                {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <Label>מזהה רשומה</Label>
              <Input placeholder="מספר רשומה..." className="mt-1" />
            </div>
            <div>
              <Label>שתף עם</Label>
              <Input placeholder="שם משתמש / קבוצה" className="mt-1" />
            </div>
            <div>
              <Label>רמת גישה</Label>
              <select className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm">
                <option>קריאה בלבד</option>
                <option>קריאה/כתיבה</option>
              </select>
            </div>
          </div>
          <div className="mt-4">
            <Button className="gap-2">
              <Share2 className="w-4 h-4" />
              שתף רשומה
            </Button>
          </div>
        </Card>
      )}

      {activeTab === "settings" && (
        <Card className="p-3 sm:p-6">
          <h3 className="text-lg font-semibold mb-4">הגדרות שיתוף</h3>
          <div className="space-y-3">
            {[
              { label: "אפשר שיתוף בין מחלקות", desc: "משתמשים יוכלו לשתף רשומות עם מחלקות אחרות", enabled: true },
              { label: "התראה על שיתוף לנמען", desc: "שלח התראה כשרשומה משותפת עם משתמש", enabled: true },
              { label: "הגבל שיתוף לתפקידים בלבד", desc: "ניתן לשתף רק לפי תפקיד, לא למשתמש ספציפי", enabled: false },
              { label: "לוג שיתופים", desc: "שמור רשומה של כל פעולות השיתוף", enabled: true },
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
              <Save className="w-4 h-4" />
              שמור הגדרות
            </Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="record-sharing" />
        <RelatedRecords entityType="record-sharing" />
      </div>
    </div>
  );
}
