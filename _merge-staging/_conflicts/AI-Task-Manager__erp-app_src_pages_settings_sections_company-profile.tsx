import { useState, useEffect } from "react";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Save, Loader2, AlertCircle, X, Phone, Mail, Globe, MapPin, Hash, Calendar, Users, Factory, Upload, Image } from "lucide-react";
import { useRef } from "react";

interface CompanyProfile {
  companyName: string;
  companyNameEn: string;
  taxId: string;
  address: string;
  city: string;
  zipCode: string;
  phone: string;
  fax: string;
  email: string;
  website: string;
  logoUrl: string;
  industry: string;
  foundedYear: string;
  employeeCount: string;
}

const EMPTY: CompanyProfile = {
  companyName: "", companyNameEn: "", taxId: "", address: "", city: "", zipCode: "",
  phone: "", fax: "", email: "", website: "", logoUrl: "", industry: "", foundedYear: "", employeeCount: "",
};

export default function CompanyProfileSection() {
  const [profile, setProfile] = useState<CompanyProfile>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const res = await authFetch("/api/settings/company-profile");
      if (res.ok) {
        const d = await res.json();
        setProfile(d);
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch("/api/settings/company-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      if (!res.ok) throw new Error("שגיאה בשמירה");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "שגיאה");
    }
    setSaving(false);
  };

  const upd = (field: keyof CompanyProfile, value: string) => {
    setProfile(p => ({ ...p, [field]: value }));
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError("גודל הקובץ חייב להיות עד 2MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      upd("logoUrl", dataUrl);
    };
    reader.readAsDataURL(file);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6" dir="rtl">
      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm">{error}</span>
          <button onClick={() => setError(null)} className="mr-auto"><X className="h-4 w-4" /></button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-green-400">
          <Save className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm">פרופיל החברה נשמר בהצלחה</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-500/5 border border-blue-500/20 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">פרופיל החברה</h2>
            <p className="text-xs text-muted-foreground">פרטי החברה, כתובת ומידע כללי</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          שמור שינויים
        </Button>
      </div>

      <Card className="bg-card/80 border-border">
        <CardContent className="p-6">
          <h3 className="text-sm font-semibold text-blue-400 border-b border-border pb-2 mb-4 flex items-center gap-2">
            <Image className="h-4 w-4" />
            לוגו החברה
          </h3>
          <div className="flex items-center gap-6">
            <div className="w-24 h-24 rounded-xl border-2 border-dashed border-border flex items-center justify-center overflow-hidden bg-input">
              {profile.logoUrl ? (
                <img src={profile.logoUrl} alt="לוגו" className="w-full h-full object-contain" />
              ) : (
                <Building2 className="w-10 h-10 text-[#3a3a4e]" />
              )}
            </div>
            <div className="flex flex-col gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="hidden"
                onChange={handleLogoUpload}
              />
              <Button
                variant="outline"
                className="gap-2 border-border text-foreground hover:bg-muted"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                העלאת לוגו
              </Button>
              {profile.logoUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                  onClick={() => upd("logoUrl", "")}
                >
                  <X className="h-3 w-3 ml-1" />
                  הסרת לוגו
                </Button>
              )}
              <p className="text-xs text-muted-foreground">PNG, JPG, SVG או WebP. עד 2MB.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/80 border-border">
        <CardContent className="p-6">
          <h3 className="text-sm font-semibold text-blue-400 border-b border-border pb-2 mb-4 flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            פרטים כלליים
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Label className="text-muted-foreground text-xs">שם החברה (עברית) *</Label>
              <Input value={profile.companyName} onChange={e => upd("companyName", e.target.value)} className="bg-input border-border text-foreground mt-1" />
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">שם החברה (אנגלית)</Label>
              <Input value={profile.companyNameEn} onChange={e => upd("companyNameEn", e.target.value)} className="bg-input border-border text-foreground mt-1" dir="ltr" />
            </div>
            <div>
              <Label className="text-muted-foreground text-xs flex items-center gap-1"><Hash className="h-3 w-3" />מספר עוסק מורשה</Label>
              <Input value={profile.taxId} onChange={e => upd("taxId", e.target.value)} className="bg-input border-border text-foreground mt-1" dir="ltr" />
            </div>
            <div>
              <Label className="text-muted-foreground text-xs flex items-center gap-1"><Factory className="h-3 w-3" />ענף תעשייה</Label>
              <Input value={profile.industry} onChange={e => upd("industry", e.target.value)} className="bg-input border-border text-foreground mt-1" />
            </div>
            <div>
              <Label className="text-muted-foreground text-xs flex items-center gap-1"><Calendar className="h-3 w-3" />שנת הקמה</Label>
              <Input value={profile.foundedYear} onChange={e => upd("foundedYear", e.target.value)} className="bg-input border-border text-foreground mt-1" dir="ltr" />
            </div>
            <div>
              <Label className="text-muted-foreground text-xs flex items-center gap-1"><Users className="h-3 w-3" />מספר עובדים</Label>
              <Input value={profile.employeeCount} onChange={e => upd("employeeCount", e.target.value)} type="number" className="bg-input border-border text-foreground mt-1" dir="ltr" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/80 border-border">
        <CardContent className="p-6">
          <h3 className="text-sm font-semibold text-blue-400 border-b border-border pb-2 mb-4 flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            כתובת
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <Label className="text-muted-foreground text-xs">כתובת</Label>
              <Input value={profile.address} onChange={e => upd("address", e.target.value)} className="bg-input border-border text-foreground mt-1" />
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">עיר</Label>
              <Input value={profile.city} onChange={e => upd("city", e.target.value)} className="bg-input border-border text-foreground mt-1" />
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">מיקוד</Label>
              <Input value={profile.zipCode} onChange={e => upd("zipCode", e.target.value)} className="bg-input border-border text-foreground mt-1" dir="ltr" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/80 border-border">
        <CardContent className="p-6">
          <h3 className="text-sm font-semibold text-blue-400 border-b border-border pb-2 mb-4 flex items-center gap-2">
            <Phone className="h-4 w-4" />
            פרטי התקשרות
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Label className="text-muted-foreground text-xs flex items-center gap-1"><Phone className="h-3 w-3" />טלפון</Label>
              <Input value={profile.phone} onChange={e => upd("phone", e.target.value)} className="bg-input border-border text-foreground mt-1" dir="ltr" />
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">פקס</Label>
              <Input value={profile.fax} onChange={e => upd("fax", e.target.value)} className="bg-input border-border text-foreground mt-1" dir="ltr" />
            </div>
            <div>
              <Label className="text-muted-foreground text-xs flex items-center gap-1"><Mail className="h-3 w-3" />אימייל</Label>
              <Input value={profile.email} onChange={e => upd("email", e.target.value)} className="bg-input border-border text-foreground mt-1" dir="ltr" />
            </div>
            <div>
              <Label className="text-muted-foreground text-xs flex items-center gap-1"><Globe className="h-3 w-3" />אתר אינטרנט</Label>
              <Input value={profile.website} onChange={e => upd("website", e.target.value)} className="bg-input border-border text-foreground mt-1" dir="ltr" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
