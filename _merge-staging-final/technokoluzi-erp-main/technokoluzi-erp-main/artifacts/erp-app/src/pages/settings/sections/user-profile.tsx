import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button, Input, Label, Card } from "@/components/ui-components";
import { User, Mail, Phone, Building2, Briefcase, Save, Camera, Shield, Clock, Key } from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import { authFetch } from "@/lib/utils";

const API_BASE = "/api";

export default function UserProfileSection() {
  const { user, token } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("details");
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    department: "",
    jobTitle: "",
  });

  useEffect(() => {
    if (user) {
      setFormData({
        fullName: (user as any).fullName || (user as any).full_name || "",
        email: (user as any).email || "",
        phone: (user as any).phone || "",
        department: (user as any).department || "",
        jobTitle: (user as any).jobTitle || (user as any).job_title || "",
      });
    }
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/auth/users/${(user as any).id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          full_name: formData.fullName,
          email: formData.email,
          phone: formData.phone,
          department: formData.department,
          job_title: formData.jobTitle,
        }),
      });
      if (res.ok) {
        toast({ title: "נשמר בהצלחה", description: "פרטי המשתמש עודכנו" });
      } else {
        toast({ title: "שגיאה", description: "לא ניתן לשמור", variant: "destructive" });
      }
    } catch {
      toast({ title: "שגיאה", description: "בעיית תקשורת", variant: "destructive" });
    }
    setLoading(false);
  };

  const [passwordData, setPasswordData] = useState({ current: "", newPass: "", confirm: "" });

  const handlePasswordChange = async () => {
    if (passwordData.newPass !== passwordData.confirm) {
      toast({ title: "שגיאה", description: "הסיסמאות לא תואמות", variant: "destructive" });
      return;
    }
    if (passwordData.newPass.length < 6) {
      toast({ title: "שגיאה", description: "סיסמה חייבת להכיל לפחות 6 תווים", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/auth/users/${(user as any)?.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password: passwordData.newPass }),
      });
      if (res.ok) {
        toast({ title: "סיסמה שונתה", description: "הסיסמה החדשה נשמרה בהצלחה" });
        setPasswordData({ current: "", newPass: "", confirm: "" });
      } else {
        toast({ title: "שגיאה", description: "לא ניתן לשנות סיסמה", variant: "destructive" });
      }
    } catch {
      toast({ title: "שגיאה", description: "בעיית תקשורת", variant: "destructive" });
    }
    setLoading(false);
  };

  const tabs = [
    { id: "details", label: "פרטים כלליים", icon: User },
    { id: "security", label: "אבטחה וסיסמה", icon: Shield },
    { id: "preferences", label: "הגדרות מצב ומספר", icon: Clock },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <h1 className="text-lg sm:text-2xl font-bold">{(user as any)?.fullName || (user as any)?.username || "משתמש"}</h1>
      </div>

      <div className="flex gap-2 mb-6 border-b border-border pb-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "details" && (
        <div className="space-y-8">
          <Card className="p-3 sm:p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-1">העדפות שלי</h3>
            <p className="text-xs text-muted-foreground mb-4">הצגת פרטי משתמש "{(user as any)?.fullName}"</p>
          </Card>

          <Card className="p-3 sm:p-6">
            <h3 className="text-lg font-semibold mb-6">משתמש ותפקיד</h3>
            <div className="grid grid-cols-2 gap-y-4 gap-x-8">
              <div>
                <Label className="text-muted-foreground text-xs">שם משתמש</Label>
                <p className="font-medium">{(user as any)?.username}</p>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">דואר אלקטרוני ראשי</Label>
                <Input value={formData.email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData(p => ({...p, email: e.target.value}))} className="mt-1" />
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">שם פרטי</Label>
                <Input value={formData.fullName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData(p => ({...p, fullName: e.target.value}))} className="mt-1" />
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">משתמש פעיל</Label>
                <p className="font-medium">{(user as any)?.isSuperAdmin ? "כן — מנהל מערכת" : "כן"}</p>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">תפקיד</Label>
                <Input value={formData.jobTitle} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData(p => ({...p, jobTitle: e.target.value}))} className="mt-1" />
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">מחלקה</Label>
                <Input value={formData.department} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData(p => ({...p, department: e.target.value}))} className="mt-1" />
              </div>
            </div>
          </Card>

          <Card className="p-3 sm:p-6">
            <h3 className="text-lg font-semibold mb-6">עוד מידע</h3>
            <div className="grid grid-cols-2 gap-y-4 gap-x-8">
              <div>
                <Label className="text-muted-foreground text-xs">טלפון נייד</Label>
                <Input value={formData.phone} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData(p => ({...p, phone: e.target.value}))} className="mt-1" />
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">סטטוס</Label>
                <p className="font-medium text-green-500">פעיל</p>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">דואר אלקטרוני אחר</Label>
                <Input placeholder="דואר משני" className="mt-1" />
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">טלפון במשרד</Label>
                <Input placeholder="טלפון משרד" className="mt-1" />
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">כתובת ל</Label>
                <Input placeholder="כתובת" className="mt-1" />
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">פקס</Label>
                <Input placeholder="מספר פקס" className="mt-1" />
              </div>
            </div>
          </Card>

          <div className="flex justify-start">
            <Button onClick={handleSave} disabled={loading} className="gap-2">
              <Save className="w-4 h-4" />
              {loading ? "שומר..." : "שמור שינויים"}
            </Button>
          </div>
        </div>
      )}

      {activeTab === "security" && (
        <div className="space-y-4 sm:space-y-6">
          <Card className="p-3 sm:p-6">
            <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
              <Key className="w-5 h-5" />
              שינוי סיסמה
            </h3>
            <div className="space-y-4 max-w-md">
              <div>
                <Label>סיסמה נוכחית</Label>
                <Input type="password" value={passwordData.current} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPasswordData(p => ({...p, current: e.target.value}))} className="mt-1" />
              </div>
              <div>
                <Label>סיסמה חדשה</Label>
                <Input type="password" value={passwordData.newPass} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPasswordData(p => ({...p, newPass: e.target.value}))} className="mt-1" />
              </div>
              <div>
                <Label>אישור סיסמה חדשה</Label>
                <Input type="password" value={passwordData.confirm} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPasswordData(p => ({...p, confirm: e.target.value}))} className="mt-1" />
              </div>
              <Button onClick={handlePasswordChange} disabled={loading}>
                {loading ? "משנה..." : "שנה סיסמה"}
              </Button>
            </div>
          </Card>

          <Card className="p-3 sm:p-6">
            <h3 className="text-lg font-semibold mb-4">מידע אבטחה</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">התחברות אחרונה:</span>
                <p className="font-medium">{(user as any)?.lastLoginAt ? new Date((user as any).lastLoginAt).toLocaleString("he-IL") : "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">מספר התחברויות:</span>
                <p className="font-medium">{(user as any)?.loginCount || 0}</p>
              </div>
              <div>
                <span className="text-muted-foreground">הצפנה:</span>
                <p className="font-medium">PBKDF2-SHA512</p>
              </div>
              <div>
                <span className="text-muted-foreground">Google OAuth:</span>
                <p className="font-medium">{(user as any)?.email ? "מחובר" : "לא מוגדר"}</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {activeTab === "preferences" && (
        <div className="space-y-4 sm:space-y-6">
          <Card className="p-3 sm:p-6">
            <h3 className="text-lg font-semibold mb-6">הגדרות תצוגה</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>שפת ממשק</Label>
                <select className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm">
                  <option value="he">עברית</option>
                  <option value="en">English</option>
                </select>
              </div>
              <div>
                <Label>אזור זמן</Label>
                <select className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm">
                  <option value="Asia/Jerusalem">ישראל (GMT+2)</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>
              <div>
                <Label>פורמט תאריך</Label>
                <select className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm">
                  <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                  <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                </select>
              </div>
              <div>
                <Label>פורמט מספרים</Label>
                <select className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm">
                  <option value="il">1,234.56 (ישראל)</option>
                  <option value="eu">1.234,56 (אירופה)</option>
                </select>
              </div>
            </div>
          </Card>

          <Card className="p-3 sm:p-6">
            <h3 className="text-lg font-semibold mb-6">התראות</h3>
            <div className="space-y-3">
              {[
                "התראות דוא\"ל על שינויים",
                "התראות מערכת בזמן אמת",
                "סיכום יומי במייל",
                "התראות על אישורי רכש",
              ].map((item) => (
                <label key={item} className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" defaultChecked className="w-4 h-4 rounded border-border" />
                  <span className="text-sm">{item}</span>
                </label>
              ))}
            </div>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="user-profile" />
        <RelatedRecords entityType="user-profile" />
      </div>
    </div>
  );
}
