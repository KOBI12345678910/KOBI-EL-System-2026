import { useState, useEffect } from "react";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Shield, Save, Loader2, AlertCircle, X, Lock, Key, Clock, Eye, EyeOff } from "lucide-react";

interface SecuritySettings {
  minPasswordLength: string;
  requireUppercase: string;
  requireNumbers: string;
  requireSpecialChars: string;
  sessionTimeoutMinutes: string;
  maxLoginAttempts: string;
  lockoutDurationMinutes: string;
  twoFactorEnabled: string;
  ipWhitelist: string;
  passwordExpiryDays: string;
  enforcePasswordHistory: string;
}

const EMPTY: SecuritySettings = {
  minPasswordLength: "8", requireUppercase: "true", requireNumbers: "true",
  requireSpecialChars: "true", sessionTimeoutMinutes: "30", maxLoginAttempts: "5",
  lockoutDurationMinutes: "15", twoFactorEnabled: "false", ipWhitelist: "",
  passwordExpiryDays: "90", enforcePasswordHistory: "3",
};

export default function SecuritySettingsSection() {
  const [settings, setSettings] = useState<SecuritySettings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const load = async () => {
    try {
      const res = await authFetch("/api/settings/security");
      if (res.ok) setSettings(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch("/api/settings/security", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error("שגיאה בשמירה");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "שגיאה");
    }
    setSaving(false);
  };

  const upd = (field: keyof SecuritySettings, value: string) => {
    setSettings(p => ({ ...p, [field]: value }));
  };

  const toggleBool = (field: keyof SecuritySettings) => {
    setSettings(p => ({ ...p, [field]: p[field] === "true" ? "false" : "true" }));
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-amber-400" /></div>;
  }

  const BoolToggle = ({ field, label }: { field: keyof SecuritySettings; label: string }) => (
    <div className="flex items-center justify-between bg-input rounded-lg p-3">
      <span className="text-sm text-foreground">{label}</span>
      <button onClick={() => toggleBool(field)}
        className={`w-11 h-6 rounded-full transition-colors relative ${settings[field] === "true" ? "bg-green-500" : "bg-muted"}`}>
        <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all ${settings[field] === "true" ? "right-0.5" : "right-[22px]"}`} />
      </button>
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-6" dir="rtl">
      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" /><span className="text-sm">{error}</span>
          <button onClick={() => setError(null)} className="mr-auto"><X className="h-4 w-4" /></button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-green-400">
          <Save className="h-4 w-4 flex-shrink-0" /><span className="text-sm">הגדרות אבטחה נשמרו בהצלחה</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-500/5 border border-amber-500/20 flex items-center justify-center">
            <Shield className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">הגדרות אבטחה</h2>
            <p className="text-xs text-muted-foreground">מדיניות סיסמאות, נעילה ואימות דו-שלבי</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          שמור שינויים
        </Button>
      </div>

      <Card className="bg-card/80 border-border">
        <CardContent className="p-6">
          <h3 className="text-sm font-semibold text-amber-400 border-b border-border pb-2 mb-4 flex items-center gap-2">
            <Lock className="h-4 w-4" />
            מדיניות סיסמאות
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Label className="text-muted-foreground text-xs">אורך סיסמה מינימלי</Label>
              <Input value={settings.minPasswordLength} onChange={e => upd("minPasswordLength", e.target.value)} type="number" min={4} max={32} className="bg-input border-border text-foreground mt-1" dir="ltr" />
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">תפוגת סיסמה (ימים)</Label>
              <Input value={settings.passwordExpiryDays} onChange={e => upd("passwordExpiryDays", e.target.value)} type="number" className="bg-input border-border text-foreground mt-1" dir="ltr" />
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">היסטוריית סיסמאות</Label>
              <Input value={settings.enforcePasswordHistory} onChange={e => upd("enforcePasswordHistory", e.target.value)} type="number" className="bg-input border-border text-foreground mt-1" dir="ltr" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
            <BoolToggle field="requireUppercase" label="דרוש אותיות גדולות" />
            <BoolToggle field="requireNumbers" label="דרוש מספרים" />
            <BoolToggle field="requireSpecialChars" label="דרוש תווים מיוחדים" />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/80 border-border">
        <CardContent className="p-6">
          <h3 className="text-sm font-semibold text-amber-400 border-b border-border pb-2 mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4" />
            נעילה והתנתקות
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Label className="text-muted-foreground text-xs">timeout session (דקות)</Label>
              <Input value={settings.sessionTimeoutMinutes} onChange={e => upd("sessionTimeoutMinutes", e.target.value)} type="number" className="bg-input border-border text-foreground mt-1" dir="ltr" />
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">מקסימום ניסיונות התחברות</Label>
              <Input value={settings.maxLoginAttempts} onChange={e => upd("maxLoginAttempts", e.target.value)} type="number" className="bg-input border-border text-foreground mt-1" dir="ltr" />
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">משך נעילה (דקות)</Label>
              <Input value={settings.lockoutDurationMinutes} onChange={e => upd("lockoutDurationMinutes", e.target.value)} type="number" className="bg-input border-border text-foreground mt-1" dir="ltr" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/80 border-border">
        <CardContent className="p-6">
          <h3 className="text-sm font-semibold text-amber-400 border-b border-border pb-2 mb-4 flex items-center gap-2">
            <Key className="h-4 w-4" />
            אימות מתקדם
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <BoolToggle field="twoFactorEnabled" label="אימות דו-שלבי (2FA)" />
            <div>
              <Label className="text-muted-foreground text-xs">רשימת IP מותרים (מופרדים בפסיק)</Label>
              <Input value={settings.ipWhitelist} onChange={e => upd("ipWhitelist", e.target.value)} placeholder="192.168.1.0/24, 10.0.0.0/8" className="bg-input border-border text-foreground mt-1" dir="ltr" />
            </div>
          </div>
          <div className="mt-4 p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
            <div className="flex items-center gap-2 text-amber-400 text-xs">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>שינוי הגדרות אבטחה ישפיע על כל המשתמשים במערכת. שינויים בכוח סיסמה יחולו על סיסמאות חדשות בלבד.</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
