// L-08: Settings Page
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/utils";
import { Building2, DollarSign, Percent, Users } from "lucide-react";

const API = "/api";

interface CompanySettings {
  companyName: string;
  companyId: string;
  address: string;
  logoUrl: string;
  vatRate: number;
  currency: string;
  minimumWage: number;
  pensionPercentage: number;
}

export default function SettingsPage() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<CompanySettings>({
    companyName: "טכנו-כל עוזי",
    companyId: "514123456",
    address: "רחוב ראשי 123, רמלה",
    logoUrl: "/images/logo.png",
    vatRate: 17,
    currency: "ILS",
    minimumWage: 34,
    pensionPercentage: 5,
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await authFetch(`${API}/settings`);
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch (err) {
      console.error("Error loading settings:", err);
    }
  };

  const handleChange = (key: keyof CompanySettings, value: any) => {
    setSettings({ ...settings, [key]: value });
  };

  const saveSettings = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        toast({ title: "הצלחה", description: "ההגדרות נשמרו בהצלחה" });
      } else {
        toast({ title: "שגיאה", description: "שגיאה בשמירת ההגדרות", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "שגיאה", description: "אירעה שגיאה בעדכון ההגדרות", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">הגדרות</h1>
        <p className="text-muted-foreground">ניהול הגדרות החברה, מטבע ושכר</p>
      </div>

      {/* Company Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            פרטי החברה
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>שם החברה</Label>
              <Input value={settings.companyName} onChange={(e) => handleChange("companyName", e.target.value)} placeholder="שם החברה" />
            </div>
            <div>
              <Label>מספר ח.פ.</Label>
              <Input value={settings.companyId} onChange={(e) => handleChange("companyId", e.target.value)} placeholder="מספר חברה" />
            </div>
            <div>
              <Label>כתובת</Label>
              <Input value={settings.address} onChange={(e) => handleChange("address", e.target.value)} placeholder="כתובת החברה" />
            </div>
            <div>
              <Label>URL לוגו</Label>
              <Input value={settings.logoUrl} onChange={(e) => handleChange("logoUrl", e.target.value)} placeholder="/images/logo.png" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* VAT Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Percent className="w-5 h-5" />
            הגדרות מע"מ
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>שיעור מע"מ (%)</Label>
            <Input type="number" value={settings.vatRate} onChange={(e) => handleChange("vatRate", parseFloat(e.target.value))} placeholder="17" step="0.01" />
          </div>
        </CardContent>
      </Card>

      {/* Currency Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            הגדרות מטבע
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>מטבע ברירת מחדל</Label>
            <select value={settings.currency} onChange={(e) => handleChange("currency", e.target.value)} className="w-full border rounded px-3 py-2">
              <option value="ILS">שקל ישראלי (₪)</option>
              <option value="USD">דולר אמריקאי ($)</option>
              <option value="EUR">יורו (€)</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Salary Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            הגדרות שכר
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>שכר מינימום (₪/שעה)</Label>
              <Input type="number" value={settings.minimumWage} onChange={(e) => handleChange("minimumWage", parseFloat(e.target.value))} placeholder="34" step="0.1" />
            </div>
            <div>
              <Label>אחוז פנסיה (%)</Label>
              <Input type="number" value={settings.pensionPercentage} onChange={(e) => handleChange("pensionPercentage", parseFloat(e.target.value))} placeholder="5" step="0.1" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={loadSettings} disabled={loading}>
          ביטול
        </Button>
        <Button onClick={saveSettings} disabled={loading}>
          {loading ? "שומר..." : "שמור הגדרות"}
        </Button>
      </div>
    </div>
  );
}
