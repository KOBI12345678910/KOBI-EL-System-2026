import { useState, useEffect } from "react";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, Save, Loader2, AlertCircle, X, DollarSign, Clock, Globe, Calendar } from "lucide-react";

interface GeneralSettings {
  currency: string;
  timezone: string;
  dateFormat: string;
  language: string;
  vatRate: string;
  fiscalYearStart: string;
  workWeekStart: string;
  decimalPlaces: string;
}

const EMPTY: GeneralSettings = {
  currency: "ILS", timezone: "Asia/Jerusalem", dateFormat: "DD/MM/YYYY",
  language: "he", vatRate: "17", fiscalYearStart: "01", workWeekStart: "sunday", decimalPlaces: "2",
};

export default function GeneralSettingsSection() {
  const [settings, setSettings] = useState<GeneralSettings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const load = async () => {
    try {
      const res = await authFetch("/api/settings/general");
      if (res.ok) setSettings(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch("/api/settings/general", {
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

  const upd = (field: keyof GeneralSettings, value: string) => {
    setSettings(p => ({ ...p, [field]: value }));
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-blue-400" /></div>;
  }

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
          <Save className="h-4 w-4 flex-shrink-0" /><span className="text-sm">הגדרות כלליות נשמרו בהצלחה</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border border-emerald-500/20 flex items-center justify-center">
            <Settings className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">הגדרות כלליות</h2>
            <p className="text-xs text-muted-foreground">מטבע, אזור זמן, פורמטים ועוד</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          שמור שינויים
        </Button>
      </div>

      <Card className="bg-card/80 border-border">
        <CardContent className="p-6">
          <h3 className="text-sm font-semibold text-emerald-400 border-b border-border pb-2 mb-4 flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            מטבע ומיסוי
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Label className="text-muted-foreground text-xs">מטבע ברירת מחדל</Label>
              <select value={settings.currency} onChange={e => upd("currency", e.target.value)}
                className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                <option value="ILS">₪ שקל ישראלי (ILS)</option>
                <option value="USD">$ דולר אמריקאי (USD)</option>
                <option value="EUR">€ אירו (EUR)</option>
              </select>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">שיעור מע&quot;מ (%)</Label>
              <Input value={settings.vatRate} onChange={e => upd("vatRate", e.target.value)} type="number" className="bg-input border-border text-foreground mt-1" dir="ltr" />
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">נקודות עשרוניות</Label>
              <select value={settings.decimalPlaces} onChange={e => upd("decimalPlaces", e.target.value)}
                className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                <option value="0">0</option>
                <option value="2">2</option>
                <option value="3">3</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/80 border-border">
        <CardContent className="p-6">
          <h3 className="text-sm font-semibold text-emerald-400 border-b border-border pb-2 mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4" />
            זמן ותאריך
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Label className="text-muted-foreground text-xs">אזור זמן</Label>
              <select value={settings.timezone} onChange={e => upd("timezone", e.target.value)}
                className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                <option value="Asia/Jerusalem">ישראל (GMT+2/+3)</option>
                <option value="Europe/London">לונדון (GMT+0/+1)</option>
                <option value="America/New_York">ניו יורק (GMT-5/-4)</option>
              </select>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">פורמט תאריך</Label>
              <select value={settings.dateFormat} onChange={e => upd("dateFormat", e.target.value)}
                className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              </select>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">תחילת שבוע עבודה</Label>
              <select value={settings.workWeekStart} onChange={e => upd("workWeekStart", e.target.value)}
                className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                <option value="sunday">יום ראשון</option>
                <option value="monday">יום שני</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/80 border-border">
        <CardContent className="p-6">
          <h3 className="text-sm font-semibold text-emerald-400 border-b border-border pb-2 mb-4 flex items-center gap-2">
            <Globe className="h-4 w-4" />
            שפה ולוקליזציה
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Label className="text-muted-foreground text-xs">שפת ממשק</Label>
              <select value={settings.language} onChange={e => upd("language", e.target.value)}
                className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                <option value="he">עברית</option>
                <option value="en">English</option>
                <option value="ar">العربية</option>
              </select>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs flex items-center gap-1"><Calendar className="h-3 w-3" />תחילת שנת כספים (חודש)</Label>
              <select value={settings.fiscalYearStart} onChange={e => upd("fiscalYearStart", e.target.value)}
                className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                <option value="01">ינואר (01)</option>
                <option value="04">אפריל (04)</option>
                <option value="07">יולי (07)</option>
                <option value="10">אוקטובר (10)</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
