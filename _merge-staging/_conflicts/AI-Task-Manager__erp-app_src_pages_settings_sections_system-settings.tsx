import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button, Input, Label, Card } from "@/components/ui-components";
import {
  Building2, Globe, MapPin, Phone, Mail, Hash, Save, Shield, FileText,
  Layers, SlidersHorizontal, Calendar, DollarSign, MessageSquare,
  Plus, Trash2, Check, X, Lock, Key, Clock, RefreshCw, Eye, EyeOff,
  Upload, AlertTriangle, Info, ChevronDown, ChevronUp, Smartphone,
  Percent, Globe2, ArrowUpDown, Star, Factory, Users, Package, Truck, CheckCircle, Loader2
} from "lucide-react";
import { authFetch } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";

const API_BASE = "/api";

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? "bg-primary" : "bg-muted"}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-card shadow transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`}
      />
    </button>
  );
}

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-6">
      <h3 className="text-lg font-semibold">{title}</h3>
      {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
    </div>
  );
}

export default function SystemSettingsSection() {
  const { toast } = useToast();
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState("company");
  const [loading, setLoading] = useState(false);
  const [seedLoading, setSeedLoading] = useState<string | null>(null);
  const [seedStatus, setSeedStatus] = useState<{ employees: number; suppliers: number; materials: number } | null>(null);

  const [companyData, setCompanyData] = useState({
    name: "טכנו-כל עוזי",
    nameEn: "TECHNO-KOL UZI",
    address: "רחוב הרצל 12",
    city: "תל אביב",
    country: "ישראל",
    zip: "6473212",
    phone: "03-1234567",
    fax: "03-7654321",
    email: "info@technokoluzi.com",
    website: "technokoluzi.com",
    taxId: "514123456",
    companyNumber: "51-412345-6",
    businessType: "עוסק מורשה",
    logo: "",
    stamp: "",
    signature: "",
  });

  const [taxData, setTaxData] = useState({
    vatRate: "17",
    vatExempt: false,
    incomeTaxRate: "23",
    nationalInsuranceRate: "3.5",
    employerNIRate: "7.5",
    fiscalYearStart: "01",
    taxYear: "2026",
    calculateAutomatic: true,
    roundingMethod: "standard",
    withholdingTaxDefault: "0",
  });

  const [currencies, setCurrencies] = useState([
    { code: "ILS", name: "שקל ישראלי", symbol: "₪", isDefault: true, rate: 1, autoUpdate: false },
    { code: "USD", name: "דולר אמריקאי", symbol: "$", isDefault: false, rate: 3.72, autoUpdate: true },
    { code: "EUR", name: "יורו", symbol: "€", isDefault: false, rate: 4.05, autoUpdate: true },
    { code: "GBP", name: "פאונד בריטי", symbol: "£", isDefault: false, rate: 4.71, autoUpdate: true },
  ]);
  const [showAddCurrency, setShowAddCurrency] = useState(false);
  const [newCurrency, setNewCurrency] = useState({ code: "", name: "", symbol: "", rate: "" });

  const [workingHours, setWorkingHours] = useState({
    sunday: { active: true, start: "08:00", end: "17:00" },
    monday: { active: true, start: "08:00", end: "17:00" },
    tuesday: { active: true, start: "08:00", end: "17:00" },
    wednesday: { active: true, start: "08:00", end: "17:00" },
    thursday: { active: true, start: "08:00", end: "17:00" },
    friday: { active: true, start: "08:00", end: "13:00" },
    saturday: { active: false, start: "08:00", end: "17:00" },
  });
  const dayNames: Record<string, string> = {
    sunday: "ראשון", monday: "שני", tuesday: "שלישי",
    wednesday: "רביעי", thursday: "חמישי", friday: "שישי", saturday: "שבת",
  };
  const [holidays, setHolidays] = useState([
    { id: 1, name: "ראש השנה", date: "2026-09-19", type: "חג" },
    { id: 2, name: "יום כיפור", date: "2026-09-28", type: "חג" },
    { id: 3, name: "פסח (יום א')", date: "2026-04-02", type: "חג" },
  ]);
  const [showAddHoliday, setShowAddHoliday] = useState(false);
  const [newHoliday, setNewHoliday] = useState({ name: "", date: "", type: "חג" });

  const [numbering, setNumbering] = useState([
    { id: 1, entity: "חשבוניות", prefix: "INV", separator: "-", padding: 5, current: 1, suffix: "", preview: "INV-00001" },
    { id: 2, entity: "הצעות מחיר", prefix: "QUO", separator: "-", padding: 5, current: 1, suffix: "", preview: "QUO-00001" },
    { id: 3, entity: "הזמנות מכירה", prefix: "SO", separator: "-", padding: 5, current: 1, suffix: "", preview: "SO-00001" },
    { id: 4, entity: "הזמנות רכש", prefix: "PO", separator: "-", padding: 5, current: 1, suffix: "", preview: "PO-00001" },
    { id: 5, entity: "לקוחות", prefix: "CUS", separator: "-", padding: 4, current: 1, suffix: "", preview: "CUS-0001" },
    { id: 6, entity: "ספקים", prefix: "SUP", separator: "-", padding: 4, current: 10, suffix: "", preview: "SUP-0010" },
    { id: 7, entity: "לידים", prefix: "LEAD", separator: "-", padding: 4, current: 1, suffix: "", preview: "LEAD-0001" },
    { id: 8, entity: "הזמנות עבודה", prefix: "WO", separator: "-", padding: 5, current: 1, suffix: "", preview: "WO-00001" },
    { id: 9, entity: "תעודות משלוח", prefix: "DN", separator: "-", padding: 5, current: 1, suffix: "", preview: "DN-00001" },
    { id: 10, entity: "הודעות זיכוי", prefix: "CN", separator: "-", padding: 5, current: 1, suffix: "", preview: "CN-00001" },
  ]);

  const updateNumberingPreview = (idx: number, updated: any) => {
    const padded = String(updated.current).padStart(updated.padding, "0");
    const preview = `${updated.prefix}${updated.separator}${padded}${updated.suffix}`;
    const newItems = [...numbering];
    newItems[idx] = { ...updated, preview };
    setNumbering(newItems);
  };

  const [smsData, setSmsData] = useState({
    provider: "019",
    apiKey: "",
    apiSecret: "",
    senderName: "TechnoKol",
    senderPhone: "",
    active: true,
  });
  const [smsTemplates, setSmsTemplates] = useState([
    { id: 1, name: "אישור הזמנה", content: "שלום {{שם_לקוח}}, הזמנתך מספר {{מספר_הזמנה}} התקבלה בהצלחה. תודה!" },
    { id: 2, name: "תזכורת תשלום", content: "שלום {{שם_לקוח}}, נא לשלם חשבונית {{מספר_חשבונית}} בסך {{סכום}} עד {{תאריך}}." },
    { id: 3, name: "אישור משלוח", content: "הזמנתך {{מספר_הזמנה}} נשלחה! מספר מעקב: {{מספר_מעקב}}" },
  ]);
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ name: "", content: "" });
  const [showApiKey, setShowApiKey] = useState(false);

  const [security, setSecurity] = useState({
    twoFactorRequired: false,
    sessionTimeout: "60",
    passwordMinLength: "8",
    passwordRequireUppercase: true,
    passwordRequireNumbers: true,
    passwordRequireSymbols: false,
    maxLoginAttempts: "5",
    lockoutDuration: "15",
    encryptSensitiveData: true,
    auditLog: true,
    ipWhitelist: "",
    sessionSingleDevice: false,
    forcePasswordChange: false,
    passwordChangeInterval: "90",
  });

  const handleSave = async () => {
    setLoading(true);
    await new Promise(r => setTimeout(r, 600));
    toast({ title: "נשמר בהצלחה", description: "הגדרות עודכנו" });
    setLoading(false);
  };

  const tabs = [
    { id: "company", label: "פרטי החברה", icon: Building2 },
    { id: "calendar", label: "לוח שנה", icon: Calendar },
    { id: "tax", label: "מס וחשבונאות", icon: Percent },
    { id: "currencies", label: "מטבעות", icon: DollarSign },
    { id: "numbering", label: "מספור", icon: Layers },
    { id: "sms", label: "SMS", icon: Smartphone },
    { id: "security", label: "אבטחה", icon: Shield },
    { id: "factory-data", label: "נתוני מפעל", icon: Factory },
  ];

  const loadSeedStatus = async () => {
    try {
      const r = await authFetch(`${API_BASE}/factory-seed/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) setSeedStatus(await r.json());
    } catch {}
  };

  const runSeed = async (endpoint: string, label: string) => {
    setSeedLoading(endpoint);
    try {
      const r = await authFetch(`${API_BASE}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const result = await r.json();
      if (result.success || result.inserted !== undefined) {
        toast({ title: `${label} — הצלחה`, description: result.message || `נוספו ${result.inserted || result.results?.employees_inserted || 0} רשומות` });
        loadSeedStatus();
      } else {
        toast({ title: "שגיאה", description: result.error || "לא הצלחנו לטעון נתונים", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "שגיאת תקשורת", description: err.message, variant: "destructive" });
    }
    setSeedLoading(null);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex gap-1 mb-6 border-b border-border overflow-x-auto pb-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ===== COMPANY ===== */}
      {activeTab === "company" && (
        <div className="space-y-4 sm:space-y-6">
          <SectionHeader title="פרטי החברה" description="הגדרות זיהוי עסקי ומידע ראשי" />

          <Card className="p-3 sm:p-6">
            <h4 className="font-semibold mb-4 text-sm text-muted-foreground uppercase tracking-wide">לוגו וחותמות</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex flex-col items-center gap-2">
                <div className="w-24 h-24 bg-muted rounded-xl flex items-center justify-center border-2 border-dashed border-border cursor-pointer hover:border-primary transition-colors">
                  <Building2 className="w-10 h-10 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground">לוגו חברה</p>
                <Button variant="outline" size="sm" className="gap-1"><Upload className="w-3 h-3" />העלה</Button>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-24 h-24 bg-muted rounded-xl flex items-center justify-center border-2 border-dashed border-border cursor-pointer hover:border-primary transition-colors">
                  <Shield className="w-10 h-10 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground">חותמת חברה</p>
                <Button variant="outline" size="sm" className="gap-1"><Upload className="w-3 h-3" />העלה</Button>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-24 h-24 bg-muted rounded-xl flex items-center justify-center border-2 border-dashed border-border cursor-pointer hover:border-primary transition-colors">
                  <FileText className="w-10 h-10 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground">חתימה דיגיטלית</p>
                <Button variant="outline" size="sm" className="gap-1"><Upload className="w-3 h-3" />העלה</Button>
              </div>
            </div>
          </Card>

          <Card className="p-3 sm:p-6">
            <h4 className="font-semibold mb-4 text-sm text-muted-foreground uppercase tracking-wide">מידע כללי</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>שם החברה (עברית)</Label>
                <Input value={companyData.name} onChange={(e: any) => setCompanyData(p => ({...p, name: e.target.value}))} className="mt-1" />
              </div>
              <div>
                <Label>שם החברה (אנגלית)</Label>
                <Input value={companyData.nameEn} onChange={(e: any) => setCompanyData(p => ({...p, nameEn: e.target.value}))} className="mt-1" />
              </div>
              <div>
                <Label>סוג עסק</Label>
                <select
                  className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  value={companyData.businessType}
                  onChange={(e) => setCompanyData(p => ({...p, businessType: e.target.value}))}
                >
                  <option value="עוסק מורשה">עוסק מורשה</option>
                  <option value="עוסק פטור">עוסק פטור</option>
                  <option value="חברה בעמ">{'חברה בע"מ'}</option>
                  <option value="שותפות">שותפות</option>
                  <option value="עמותה">עמותה</option>
                </select>
              </div>
              <div>
                <Label>מספר עוסק / ח.פ.</Label>
                <Input value={companyData.taxId} onChange={(e: any) => setCompanyData(p => ({...p, taxId: e.target.value}))} className="mt-1" placeholder="514123456" />
              </div>
              <div>
                <Label>מספר חברה (רשם חברות)</Label>
                <Input value={companyData.companyNumber} onChange={(e: any) => setCompanyData(p => ({...p, companyNumber: e.target.value}))} className="mt-1" placeholder="51-412345-6" />
              </div>
            </div>
          </Card>

          <Card className="p-3 sm:p-6">
            <h4 className="font-semibold mb-4 text-sm text-muted-foreground uppercase tracking-wide">כתובת</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>רחוב ומספר</Label>
                <Input value={companyData.address} onChange={(e: any) => setCompanyData(p => ({...p, address: e.target.value}))} className="mt-1" placeholder="רחוב הרצל 12" />
              </div>
              <div>
                <Label>עיר</Label>
                <Input value={companyData.city} onChange={(e: any) => setCompanyData(p => ({...p, city: e.target.value}))} className="mt-1" />
              </div>
              <div>
                <Label>מיקוד</Label>
                <Input value={companyData.zip} onChange={(e: any) => setCompanyData(p => ({...p, zip: e.target.value}))} className="mt-1" />
              </div>
              <div>
                <Label>ארץ</Label>
                <Input value={companyData.country} onChange={(e: any) => setCompanyData(p => ({...p, country: e.target.value}))} className="mt-1" />
              </div>
            </div>
          </Card>

          <Card className="p-3 sm:p-6">
            <h4 className="font-semibold mb-4 text-sm text-muted-foreground uppercase tracking-wide">פרטי יצירת קשר</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>טלפון</Label>
                <Input value={companyData.phone} onChange={(e: any) => setCompanyData(p => ({...p, phone: e.target.value}))} className="mt-1" />
              </div>
              <div>
                <Label>פקס</Label>
                <Input value={companyData.fax} onChange={(e: any) => setCompanyData(p => ({...p, fax: e.target.value}))} className="mt-1" />
              </div>
              <div>
                <Label>דואר אלקטרוני</Label>
                <Input value={companyData.email} onChange={(e: any) => setCompanyData(p => ({...p, email: e.target.value}))} className="mt-1" type="email" />
              </div>
              <div>
                <Label>אתר אינטרנט</Label>
                <Input value={companyData.website} onChange={(e: any) => setCompanyData(p => ({...p, website: e.target.value}))} className="mt-1" />
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

      {/* ===== CALENDAR ===== */}
      {activeTab === "calendar" && (
        <div className="space-y-4 sm:space-y-6">
          <SectionHeader title="לוח שנה ושעות עבודה" description="הגדרת ימי עבודה, שעות ואירועים מיוחדים" />

          <Card className="p-3 sm:p-6">
            <h4 className="font-semibold mb-4 text-sm text-muted-foreground uppercase tracking-wide">שעות עבודה שבועיות</h4>
            <div className="space-y-3">
              {Object.entries(workingHours).map(([day, hours]) => (
                <div key={day} className="flex items-center gap-4 p-3 rounded-lg bg-muted/30">
                  <Toggle
                    checked={hours.active}
                    onChange={(v) => setWorkingHours(p => ({ ...p, [day]: { ...hours, active: v } }))}
                  />
                  <span className="w-16 text-sm font-medium">{dayNames[day]}</span>
                  {hours.active ? (
                    <>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs whitespace-nowrap">מ-</Label>
                        <input
                          type="time"
                          value={hours.start}
                          onChange={(e) => setWorkingHours(p => ({ ...p, [day]: { ...hours, start: e.target.value } }))}
                          className="bg-background border border-border rounded-lg px-2 py-1 text-sm"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs whitespace-nowrap">עד</Label>
                        <input
                          type="time"
                          value={hours.end}
                          onChange={(e) => setWorkingHours(p => ({ ...p, [day]: { ...hours, end: e.target.value } }))}
                          className="bg-background border border-border rounded-lg px-2 py-1 text-sm"
                        />
                      </div>
                      <span className="text-xs text-muted-foreground mr-auto">
                        {(() => {
                          const s = hours.start.split(":").map(Number);
                          const e = hours.end.split(":").map(Number);
                          const diff = (e[0] * 60 + e[1]) - (s[0] * 60 + s[1]);
                          return `${Math.floor(diff / 60)}:${String(diff % 60).padStart(2, "0")} שעות`;
                        })()}
                      </span>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">יום חופש</span>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-3 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">חגים ואירועים מיוחדים</h4>
              <Button onClick={() => setShowAddHoliday(true)} size="sm" variant="outline" className="gap-1">
                <Plus className="w-3.5 h-3.5" /> הוסף
              </Button>
            </div>

            {showAddHoliday && (
              <div className="mb-4 p-4 bg-primary/5 border border-primary/20 rounded-lg">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label>שם</Label>
                    <Input value={newHoliday.name} onChange={(e: any) => setNewHoliday(p => ({ ...p, name: e.target.value }))} className="mt-1" placeholder="ראש השנה" />
                  </div>
                  <div>
                    <Label>תאריך</Label>
                    <input type="date" value={newHoliday.date} onChange={(e) => setNewHoliday(p => ({ ...p, date: e.target.value }))} className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <Label>סוג</Label>
                    <select className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm" value={newHoliday.type} onChange={(e) => setNewHoliday(p => ({ ...p, type: e.target.value }))}>
                      <option value="חג">חג</option>
                      <option value="יום זיכרון">יום זיכרון</option>
                      <option value="חופשה">חופשה</option>
                      <option value="אחר">אחר</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" onClick={() => {
                    if (newHoliday.name && newHoliday.date) {
                      setHolidays(p => [...p, { id: Date.now(), ...newHoliday }]);
                      setNewHoliday({ name: "", date: "", type: "חג" });
                      setShowAddHoliday(false);
                    }
                  }}>
                    <Check className="w-3.5 h-3.5 mr-1" /> הוסף
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowAddHoliday(false)}>
                    <X className="w-3.5 h-3.5 mr-1" /> ביטול
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {holidays.map((h) => (
                <div key={h.id} className="flex items-center justify-between p-3 bg-muted/20 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Calendar className="w-4 h-4 text-primary" />
                    <span className="font-medium text-sm">{h.name}</span>
                    <span className="text-xs text-muted-foreground">{h.date}</span>
                    <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-md">{h.type}</span>
                  </div>
                  <button onClick={() => setHolidays(p => p.filter(x => x.id !== h.id))} className="p-1 hover:bg-destructive/10 rounded text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
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

      {/* ===== TAX ===== */}
      {activeTab === "tax" && (
        <div className="space-y-4 sm:space-y-6">
          <SectionHeader title="הגדרות מס וחשבונאות" description="VAT, מס הכנסה, ביטוח לאומי וחישובים אוטומטיים" />

          <Card className="p-3 sm:p-6">
            <h4 className="font-semibold mb-4 text-sm text-muted-foreground uppercase tracking-wide">מע"מ (VAT)</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>שיעור מע"מ (%)</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={taxData.vatRate}
                    onChange={(e: any) => setTaxData(p => ({...p, vatRate: e.target.value}))}
                    type="number"
                    min="0"
                    max="100"
                    className="flex-1"
                  />
                  <span className="flex items-center text-sm text-muted-foreground">%</span>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                <div className="flex-1">
                  <p className="text-sm font-medium">פטור ממע"מ</p>
                  <p className="text-xs text-muted-foreground">עסק פטור ממע"מ לפי חוק</p>
                </div>
                <Toggle checked={taxData.vatExempt} onChange={(v) => setTaxData(p => ({...p, vatExempt: v}))} />
              </div>
            </div>
            {!taxData.vatExempt && (
              <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-300">שיעור מע"מ נוכחי: {taxData.vatRate}%. חל על כל העסקאות שאינן פטורות.</p>
              </div>
            )}
          </Card>

          <Card className="p-3 sm:p-6">
            <h4 className="font-semibold mb-4 text-sm text-muted-foreground uppercase tracking-wide">מס הכנסה</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>שיעור מס הכנסה חברות (%)</Label>
                <Input
                  value={taxData.incomeTaxRate}
                  onChange={(e: any) => setTaxData(p => ({...p, incomeTaxRate: e.target.value}))}
                  type="number"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>ניכוי מס במקור ברירת מחדל (%)</Label>
                <Input
                  value={taxData.withholdingTaxDefault}
                  onChange={(e: any) => setTaxData(p => ({...p, withholdingTaxDefault: e.target.value}))}
                  type="number"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>שנת מס נוכחית</Label>
                <Input value={taxData.taxYear} readOnly className="mt-1 bg-muted/50 cursor-not-allowed" />
              </div>
              <div>
                <Label>תחילת שנת כספים</Label>
                <select
                  className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  value={taxData.fiscalYearStart}
                  onChange={(e) => setTaxData(p => ({...p, fiscalYearStart: e.target.value}))}
                >
                  <option value="01">ינואר</option>
                  <option value="04">אפריל</option>
                  <option value="07">יולי</option>
                  <option value="10">אוקטובר</option>
                </select>
              </div>
            </div>
          </Card>

          <Card className="p-3 sm:p-6">
            <h4 className="font-semibold mb-4 text-sm text-muted-foreground uppercase tracking-wide">ביטוח לאומי</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>שיעור ביטוח לאומי עובד (%)</Label>
                <Input
                  value={taxData.nationalInsuranceRate}
                  onChange={(e: any) => setTaxData(p => ({...p, nationalInsuranceRate: e.target.value}))}
                  type="number"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>שיעור ביטוח לאומי מעסיק (%)</Label>
                <Input
                  value={taxData.employerNIRate}
                  onChange={(e: any) => setTaxData(p => ({...p, employerNIRate: e.target.value}))}
                  type="number"
                  className="mt-1"
                />
              </div>
            </div>
          </Card>

          <Card className="p-3 sm:p-6">
            <h4 className="font-semibold mb-4 text-sm text-muted-foreground uppercase tracking-wide">חישובים אוטומטיים</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <div>
                  <p className="font-medium text-sm">חישוב מע"מ אוטומטי</p>
                  <p className="text-xs text-muted-foreground">הוסף מע"מ אוטומטית לכל עסקה</p>
                </div>
                <Toggle checked={taxData.calculateAutomatic} onChange={(v) => setTaxData(p => ({...p, calculateAutomatic: v}))} />
              </div>
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <div>
                  <p className="font-medium text-sm">שיטת עיגול</p>
                  <p className="text-xs text-muted-foreground">כיצד לעגל סכומים</p>
                </div>
                <select
                  className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm"
                  value={taxData.roundingMethod}
                  onChange={(e) => setTaxData(p => ({...p, roundingMethod: e.target.value}))}
                >
                  <option value="standard">עיגול רגיל (0.5+)</option>
                  <option value="up">תמיד למעלה</option>
                  <option value="down">תמיד למטה</option>
                  <option value="none">ללא עיגול</option>
                </select>
              </div>
            </div>

            <div className="mt-4 p-4 bg-muted/30 rounded-xl">
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-3">דוגמת חישוב לעסקה של 1,000 ₪</p>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span>סכום בסיס</span><span>₪1,000.00</span></div>
                <div className="flex justify-between text-primary"><span>מע"מ ({taxData.vatRate}%)</span><span>₪{(1000 * parseFloat(taxData.vatRate || "0") / 100).toFixed(2)}</span></div>
                <div className="flex justify-between font-bold border-t border-border pt-1 mt-1">
                  <span>סה"כ</span>
                  <span>₪{(1000 + 1000 * parseFloat(taxData.vatRate || "0") / 100).toFixed(2)}</span>
                </div>
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

      {/* ===== CURRENCIES ===== */}
      {activeTab === "currencies" && (
        <div className="space-y-4 sm:space-y-6">
          <SectionHeader title="ניהול מטבעות" description="הגדרת מטבעות, שערי חליפין ועדכון אוטומטי" />

          <Card className="p-3 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">מטבעות פעילים</h4>
              <div className="flex gap-2">
                <Button onClick={() => toast({ title: "מעדכן שערים...", description: "שערי חליפין יעודכנו מהבנק" })} variant="outline" size="sm" className="gap-1">
                  <RefreshCw className="w-3.5 h-3.5" /> עדכן שערים
                </Button>
                <Button onClick={() => setShowAddCurrency(true)} size="sm" className="gap-1">
                  <Plus className="w-3.5 h-3.5" /> הוסף מטבע
                </Button>
              </div>
            </div>

            {showAddCurrency && (
              <div className="mb-4 p-4 bg-primary/5 border border-primary/20 rounded-lg">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <Label>קוד מטבע</Label>
                    <Input value={newCurrency.code} onChange={(e: any) => setNewCurrency(p => ({...p, code: e.target.value.toUpperCase()}))} placeholder="JPY" className="mt-1" maxLength={3} />
                  </div>
                  <div>
                    <Label>שם</Label>
                    <Input value={newCurrency.name} onChange={(e: any) => setNewCurrency(p => ({...p, name: e.target.value}))} placeholder="ין יפני" className="mt-1" />
                  </div>
                  <div>
                    <Label>סמל</Label>
                    <Input value={newCurrency.symbol} onChange={(e: any) => setNewCurrency(p => ({...p, symbol: e.target.value}))} placeholder="¥" className="mt-1" />
                  </div>
                  <div>
                    <Label>שער (יחס ל-ILS)</Label>
                    <Input value={newCurrency.rate} onChange={(e: any) => setNewCurrency(p => ({...p, rate: e.target.value}))} type="number" step="0.001" className="mt-1" />
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" onClick={() => {
                    if (newCurrency.code && newCurrency.name) {
                      setCurrencies(p => [...p, { ...newCurrency, rate: parseFloat(newCurrency.rate) || 1, isDefault: false, autoUpdate: false }]);
                      setNewCurrency({ code: "", name: "", symbol: "", rate: "" });
                      setShowAddCurrency(false);
                    }
                  }}>
                    <Check className="w-3.5 h-3.5 mr-1" /> הוסף
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowAddCurrency(false)}>
                    <X className="w-3.5 h-3.5 mr-1" /> ביטול
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {currencies.map((curr, idx) => (
                <div key={curr.code} className={`flex items-center gap-4 p-4 rounded-xl border ${curr.isDefault ? "border-primary/30 bg-primary/5" : "border-border bg-muted/20"}`}>
                  <div className="w-10 h-10 rounded-lg bg-background border border-border flex items-center justify-center text-lg font-bold">
                    {curr.symbol}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{curr.name}</span>
                      <span className="text-xs px-1.5 py-0.5 bg-muted rounded font-mono">{curr.code}</span>
                      {curr.isDefault && (
                        <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-yellow-500/10 text-yellow-400 rounded-md">
                          <Star className="w-3 h-3" /> ברירת מחדל
                        </span>
                      )}
                    </div>
                    {!curr.isDefault && (
                      <p className="text-xs text-muted-foreground mt-0.5">1 {curr.code} = {curr.rate} ILS</p>
                    )}
                  </div>
                  {!curr.isDefault && (
                    <div className="flex items-center gap-2">
                      <div>
                        <Label className="text-xs">שער</Label>
                        <Input
                          value={curr.rate}
                          type="number"
                          step="0.001"
                          onChange={(e: any) => {
                            const updated = [...currencies];
                            updated[idx] = { ...curr, rate: parseFloat(e.target.value) };
                            setCurrencies(updated);
                          }}
                          className="mt-0.5 h-8 w-24"
                        />
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <Label className="text-xs">עדכון אוטומטי</Label>
                        <Toggle
                          checked={curr.autoUpdate}
                          onChange={(v) => {
                            const updated = [...currencies];
                            updated[idx] = { ...curr, autoUpdate: v };
                            setCurrencies(updated);
                          }}
                        />
                      </div>
                      <Button
                        onClick={() => {
                          const updated = currencies.map((c, i) => ({ ...c, isDefault: i === idx }));
                          setCurrencies(updated);
                        }}
                        variant="outline"
                        size="sm"
                        className="gap-1"
                      >
                        <Star className="w-3.5 h-3.5" /> קבע כברירת מחדל
                      </Button>
                      <button
                        onClick={() => setCurrencies(p => p.filter(c => c.code !== curr.code))}
                        className="p-1.5 hover:bg-destructive/10 rounded text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4 bg-muted/20">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="text-xs text-muted-foreground space-y-1">
                <p>שערי חליפין מעודכנים מבנק ישראל. עדכון אוטומטי מתבצע פעם ביום.</p>
                <p>מטבע ברירת המחדל משמש לדוחות ולחישובים הכספיים.</p>
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

      {/* ===== NUMBERING ===== */}
      {activeTab === "numbering" && (
        <div className="space-y-4 sm:space-y-6">
          <SectionHeader title="מספור אוטומטי" description="הגדרת תבניות מספור לכל סוג מסמך וישות במערכת" />

          <Card className="p-3 sm:p-6">
            <div className="space-y-4">
              <div className="grid grid-cols-5 gap-2 text-xs font-semibold text-muted-foreground uppercase px-3">
                <span>ישות</span>
                <span>תחילית</span>
                <span>מפריד</span>
                <span>ריפוד ספרות</span>
                <span>מונה / תצוגה מקדימה</span>
              </div>
              {numbering.map((item, idx) => (
                <div key={item.id} className="grid grid-cols-5 gap-2 p-3 bg-muted/30 rounded-lg items-center">
                  <span className="text-sm font-medium">{item.entity}</span>
                  <Input
                    value={item.prefix}
                    onChange={(e: any) => updateNumberingPreview(idx, { ...item, prefix: e.target.value })}
                    className="h-8 text-sm font-mono"
                    placeholder="INV"
                  />
                  <select
                    className="h-8 bg-background border border-border rounded-lg px-2 text-sm"
                    value={item.separator}
                    onChange={(e) => updateNumberingPreview(idx, { ...item, separator: e.target.value })}
                  >
                    <option value="-">-</option>
                    <option value="/">&#47;</option>
                    <option value="_">_</option>
                    <option value="">ללא</option>
                  </select>
                  <select
                    className="h-8 bg-background border border-border rounded-lg px-2 text-sm"
                    value={item.padding}
                    onChange={(e) => updateNumberingPreview(idx, { ...item, padding: parseInt(e.target.value) })}
                  >
                    <option value="3">3 ספרות</option>
                    <option value="4">4 ספרות</option>
                    <option value="5">5 ספרות</option>
                    <option value="6">6 ספרות</option>
                  </select>
                  <div className="flex items-center gap-2">
                    <Input
                      value={item.current}
                      type="number"
                      min="1"
                      onChange={(e: any) => updateNumberingPreview(idx, { ...item, current: parseInt(e.target.value) || 1 })}
                      className="h-8 text-sm w-20"
                    />
                    <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-1 rounded">{item.preview}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4 bg-muted/20">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="text-xs text-muted-foreground space-y-1">
                <p>תחילית + מפריד + מספר מרופד = מספר סידורי. לדוגמה: INV-00001</p>
                <p>המונה הנוכחי מציין את המספר הבא שיינתן לישות חדשה.</p>
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

      {/* ===== SMS ===== */}
      {activeTab === "sms" && (
        <div className="space-y-4 sm:space-y-6">
          <SectionHeader title="הגדרות SMS" description="חיבור לספק SMS ותבניות הודעות" />

          <Card className="p-3 sm:p-6">
            <h4 className="font-semibold mb-4 text-sm text-muted-foreground uppercase tracking-wide">ספק SMS</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>ספק SMS</Label>
                <select
                  className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  value={smsData.provider}
                  onChange={(e) => setSmsData(p => ({...p, provider: e.target.value}))}
                >
                  <option value="">בחר ספק...</option>
                  <option value="019">019 SMS</option>
                  <option value="inforu">InforUMobile</option>
                  <option value="sms4free">SMS4Free</option>
                  <option value="twilio">Twilio</option>
                  <option value="vonage">Vonage</option>
                  <option value="messagebird">MessageBird</option>
                </select>
              </div>
              <div>
                <Label>סטטוס</Label>
                <div className="mt-1 flex items-center gap-3 p-2.5 bg-muted/30 rounded-lg">
                  <Toggle checked={smsData.active} onChange={(v) => setSmsData(p => ({...p, active: v}))} />
                  <span className="text-sm">{smsData.active ? "פעיל" : "מנוטרל"}</span>
                </div>
              </div>
              <div>
                <Label>מפתח API</Label>
                <div className="relative mt-1">
                  <Input
                    type={showApiKey ? "text" : "password"}
                    value={smsData.apiKey}
                    onChange={(e: any) => setSmsData(p => ({...p, apiKey: e.target.value}))}
                    placeholder="הזן מפתח API"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <Label>סיסמה / API Secret</Label>
                <Input
                  type="password"
                  value={smsData.apiSecret}
                  onChange={(e: any) => setSmsData(p => ({...p, apiSecret: e.target.value}))}
                  placeholder="הזן סיסמה"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>שם שולח (Sender ID)</Label>
                <Input
                  value={smsData.senderName}
                  onChange={(e: any) => setSmsData(p => ({...p, senderName: e.target.value}))}
                  placeholder="שם שיוצג בהודעה"
                  className="mt-1"
                  maxLength={11}
                />
                <p className="text-xs text-muted-foreground mt-1">עד 11 תווים, ללא רווחים</p>
              </div>
              <div>
                <Label>מספר שולח</Label>
                <Input
                  value={smsData.senderPhone}
                  onChange={(e: any) => setSmsData(p => ({...p, senderPhone: e.target.value}))}
                  placeholder="+972501234567"
                  className="mt-1"
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" size="sm" onClick={() => toast({ title: "הודעת בדיקה נשלחה", description: "SMS נשלח למספר הבדיקה" })}>
                בדוק חיבור
              </Button>
            </div>
          </Card>

          <Card className="p-3 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">תבניות הודעות</h4>
              <Button onClick={() => setShowAddTemplate(true)} size="sm" variant="outline" className="gap-1">
                <Plus className="w-3.5 h-3.5" /> הוסף תבנית
              </Button>
            </div>

            {showAddTemplate && (
              <div className="mb-4 p-4 bg-primary/5 border border-primary/20 rounded-lg">
                <div className="space-y-3">
                  <div>
                    <Label>שם התבנית</Label>
                    <Input value={newTemplate.name} onChange={(e: any) => setNewTemplate(p => ({...p, name: e.target.value}))} placeholder="אישור הזמנה" className="mt-1" />
                  </div>
                  <div>
                    <Label>תוכן ההודעה</Label>
                    <textarea
                      className="w-full mt-1 bg-background border border-border rounded-lg p-3 text-sm resize-none h-24"
                      placeholder="שלום {{שם_לקוח}}, ..."
                      value={newTemplate.content}
                      onChange={(e) => setNewTemplate(p => ({...p, content: e.target.value}))}
                    />
                    <p className="text-xs text-muted-foreground mt-1">משתנים: {"{{שם_לקוח}}"}, {"{{מספר_הזמנה}}"}, {"{{סכום}}"}, {"{{תאריך}}"}</p>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" onClick={() => {
                    if (newTemplate.name && newTemplate.content) {
                      setSmsTemplates(p => [...p, { id: Date.now(), ...newTemplate }]);
                      setNewTemplate({ name: "", content: "" });
                      setShowAddTemplate(false);
                    }
                  }}>
                    <Check className="w-3.5 h-3.5 mr-1" /> הוסף
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowAddTemplate(false)}>
                    <X className="w-3.5 h-3.5 mr-1" /> ביטול
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {smsTemplates.map((tmpl) => (
                <div key={tmpl.id} className="p-4 bg-muted/20 rounded-xl border border-border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm">{tmpl.name}</span>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toast({ title: "שליחה לבדיקה", description: `תבנית "${tmpl.name}" נשלחה לבדיקה` })}
                      >
                        בדוק
                      </Button>
                      <button
                        onClick={() => setSmsTemplates(p => p.filter(t => t.id !== tmpl.id))}
                        className="p-1.5 hover:bg-destructive/10 rounded text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono bg-muted/50 p-2 rounded">{tmpl.content}</p>
                </div>
              ))}
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

      {/* ===== SECURITY ===== */}
      {activeTab === "security" && (
        <div className="space-y-4 sm:space-y-6">
          <SectionHeader title="הגדרות אבטחה" description="ניהול sessions, הצפנה, דרישות סיסמה ובקרת גישה" />

          <Card className="p-3 sm:p-6">
            <h4 className="font-semibold mb-4 text-sm text-muted-foreground uppercase tracking-wide">אימות וסשן</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <div>
                  <p className="font-medium text-sm">אימות דו-שלבי (2FA) חובה</p>
                  <p className="text-xs text-muted-foreground">כל המשתמשים חייבים להפעיל 2FA</p>
                </div>
                <Toggle checked={security.twoFactorRequired} onChange={(v) => setSecurity(p => ({...p, twoFactorRequired: v}))} />
              </div>
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <div>
                  <p className="font-medium text-sm">תפוגת סשן</p>
                  <p className="text-xs text-muted-foreground">ניתוק אוטומטי אחרי חוסר פעילות</p>
                </div>
                <select
                  className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm"
                  value={security.sessionTimeout}
                  onChange={(e) => setSecurity(p => ({...p, sessionTimeout: e.target.value}))}
                >
                  <option value="15">15 דקות</option>
                  <option value="30">30 דקות</option>
                  <option value="60">שעה</option>
                  <option value="480">8 שעות</option>
                  <option value="1440">24 שעות</option>
                  <option value="0">ללא הגבלה</option>
                </select>
              </div>
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <div>
                  <p className="font-medium text-sm">התחברות ממכשיר יחיד</p>
                  <p className="text-xs text-muted-foreground">כל משתמש יוכל להיות מחובר ממכשיר אחד בלבד</p>
                </div>
                <Toggle checked={security.sessionSingleDevice} onChange={(v) => setSecurity(p => ({...p, sessionSingleDevice: v}))} />
              </div>
            </div>
          </Card>

          <Card className="p-3 sm:p-6">
            <h4 className="font-semibold mb-4 text-sm text-muted-foreground uppercase tracking-wide">דרישות סיסמה</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <div>
                  <p className="font-medium text-sm">אורך מינימלי</p>
                </div>
                <select
                  className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm"
                  value={security.passwordMinLength}
                  onChange={(e) => setSecurity(p => ({...p, passwordMinLength: e.target.value}))}
                >
                  <option value="6">6 תווים</option>
                  <option value="8">8 תווים</option>
                  <option value="10">10 תווים</option>
                  <option value="12">12 תווים</option>
                </select>
              </div>
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <div>
                  <p className="font-medium text-sm">דרוש אות גדולה</p>
                </div>
                <Toggle checked={security.passwordRequireUppercase} onChange={(v) => setSecurity(p => ({...p, passwordRequireUppercase: v}))} />
              </div>
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <div>
                  <p className="font-medium text-sm">דרוש מספר</p>
                </div>
                <Toggle checked={security.passwordRequireNumbers} onChange={(v) => setSecurity(p => ({...p, passwordRequireNumbers: v}))} />
              </div>
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <div>
                  <p className="font-medium text-sm">דרוש סמל מיוחד</p>
                </div>
                <Toggle checked={security.passwordRequireSymbols} onChange={(v) => setSecurity(p => ({...p, passwordRequireSymbols: v}))} />
              </div>
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <div>
                  <p className="font-medium text-sm">החלפת סיסמה מחויבת</p>
                  <p className="text-xs text-muted-foreground">אחרי כמה ימים לחייב החלפה</p>
                </div>
                <div className="flex items-center gap-2">
                  <Toggle checked={security.forcePasswordChange} onChange={(v) => setSecurity(p => ({...p, forcePasswordChange: v}))} />
                  {security.forcePasswordChange && (
                    <select
                      className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm"
                      value={security.passwordChangeInterval}
                      onChange={(e) => setSecurity(p => ({...p, passwordChangeInterval: e.target.value}))}
                    >
                      <option value="30">30 יום</option>
                      <option value="60">60 יום</option>
                      <option value="90">90 יום</option>
                      <option value="180">180 יום</option>
                    </select>
                  )}
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-3 sm:p-6">
            <h4 className="font-semibold mb-4 text-sm text-muted-foreground uppercase tracking-wide">נעילה ובקרת גישה</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <div>
                  <p className="font-medium text-sm">נעילת חשבון לאחר ניסיונות כושלים</p>
                </div>
                <select
                  className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm"
                  value={security.maxLoginAttempts}
                  onChange={(e) => setSecurity(p => ({...p, maxLoginAttempts: e.target.value}))}
                >
                  <option value="3">3 ניסיונות</option>
                  <option value="5">5 ניסיונות</option>
                  <option value="10">10 ניסיונות</option>
                  <option value="0">ללא נעילה</option>
                </select>
              </div>
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <div>
                  <p className="font-medium text-sm">משך נעילה</p>
                  <p className="text-xs text-muted-foreground">זמן נעילה לאחר ניסיונות כושלים</p>
                </div>
                <select
                  className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm"
                  value={security.lockoutDuration}
                  onChange={(e) => setSecurity(p => ({...p, lockoutDuration: e.target.value}))}
                >
                  <option value="5">5 דקות</option>
                  <option value="15">15 דקות</option>
                  <option value="30">30 דקות</option>
                  <option value="60">שעה</option>
                </select>
              </div>
              <div>
                <Label className="text-sm font-medium">רשימת IP מורשים (IP Whitelist)</Label>
                <p className="text-xs text-muted-foreground mb-2">הפרד בפסיקים. השאר ריק לאפשר כל IP.</p>
                <textarea
                  className="w-full bg-background border border-border rounded-lg p-3 text-sm resize-none h-20 font-mono"
                  placeholder="192.168.1.1, 10.0.0.0/24"
                  value={security.ipWhitelist}
                  onChange={(e) => setSecurity(p => ({...p, ipWhitelist: e.target.value}))}
                />
              </div>
            </div>
          </Card>

          <Card className="p-3 sm:p-6">
            <h4 className="font-semibold mb-4 text-sm text-muted-foreground uppercase tracking-wide">הצפנה ויומן</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <div>
                  <p className="font-medium text-sm">הצפנת מידע רגיש</p>
                  <p className="text-xs text-muted-foreground">הצפנת שדות רגישים (AES-256)</p>
                </div>
                <Toggle checked={security.encryptSensitiveData} onChange={(v) => setSecurity(p => ({...p, encryptSensitiveData: v}))} />
              </div>
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <div>
                  <p className="font-medium text-sm">יומן ביקורת (Audit Log)</p>
                  <p className="text-xs text-muted-foreground">תיעוד כל פעולות המשתמשים</p>
                </div>
                <Toggle checked={security.auditLog} onChange={(v) => setSecurity(p => ({...p, auditLog: v}))} />
              </div>
            </div>

            {security.encryptSensitiveData && (
              <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center gap-2">
                <Shield className="w-4 h-4 text-green-400" />
                <p className="text-xs text-green-300">הצפנה AES-256 פעילה. מידע רגיש מוצפן בזמן אחסון ובזמן העברה.</p>
              </div>
            )}
          </Card>

          <div className="flex justify-start">
            <Button onClick={handleSave} disabled={loading} className="gap-2">
              <Save className="w-4 h-4" />
              {loading ? "שומר..." : "שמור שינויים"}
            </Button>
          </div>
        </div>
      )}

      {activeTab === "factory-data" && (
        <div className="space-y-6">
          <SectionHeader title="נתוני מפעל — ייבוא נתוני בסיס" description="אתחול נתוני בסיס לפי תבנית מפעל מגירות: 200 עובדים, 15 ספקים, 60 SKU חומרי גלם. לשימוש מנהל מערכת בלבד." />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-4 border-blue-500/20 bg-blue-500/5">
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-5 h-5 text-blue-400" />
                <h4 className="font-semibold text-sm">עובדים</h4>
              </div>
              <p className="text-xs text-muted-foreground mb-3">200 עובדים עם כל הפרטים — שם, מחלקה, תפקיד, שכר, תאריך תחילה</p>
              {seedStatus && (
                <div className="mb-3 flex items-center gap-2">
                  {seedStatus.employees >= 150 ? (
                    <span className="text-xs text-green-400 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> {seedStatus.employees} עובדים קיימים</span>
                  ) : (
                    <span className="text-xs text-amber-400">{seedStatus.employees} עובדים קיימים</span>
                  )}
                </div>
              )}
              <Button
                size="sm"
                className="w-full"
                onClick={() => runSeed("factory-seed/employees", "עובדים")}
                disabled={seedLoading === "factory-seed/employees"}
              >
                {seedLoading === "factory-seed/employees" ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Users className="w-4 h-4 ml-2" />}
                טען 200 עובדים
              </Button>
            </Card>

            <Card className="p-4 border-green-500/20 bg-green-500/5">
              <div className="flex items-center gap-2 mb-3">
                <Truck className="w-5 h-5 text-green-400" />
                <h4 className="font-semibold text-sm">ספקים</h4>
              </div>
              <p className="text-xs text-muted-foreground mb-3">15 ספקים: אלומיניום, ברזל, נירוסטה, זכוכית, חומרי עזר ועוד</p>
              {seedStatus && (
                <div className="mb-3 flex items-center gap-2">
                  {seedStatus.suppliers >= 10 ? (
                    <span className="text-xs text-green-400 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> {seedStatus.suppliers} ספקים קיימים</span>
                  ) : (
                    <span className="text-xs text-amber-400">{seedStatus.suppliers} ספקים קיימים</span>
                  )}
                </div>
              )}
              <Button
                size="sm"
                className="w-full"
                onClick={() => runSeed("factory-seed/suppliers", "ספקים")}
                disabled={seedLoading === "factory-seed/suppliers"}
              >
                {seedLoading === "factory-seed/suppliers" ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Truck className="w-4 h-4 ml-2" />}
                טען 15 ספקים
              </Button>
            </Card>

            <Card className="p-4 border-purple-500/20 bg-purple-500/5">
              <div className="flex items-center gap-2 mb-3">
                <Package className="w-5 h-5 text-purple-400" />
                <h4 className="font-semibold text-sm">חומרי גלם (60 SKU)</h4>
              </div>
              <p className="text-xs text-muted-foreground mb-3">60 פריטים: פרופילי אלומיניום, ברזל, נירוסטה, זכוכית, אביזרים</p>
              {seedStatus && (
                <div className="mb-3 flex items-center gap-2">
                  {seedStatus.materials >= 40 ? (
                    <span className="text-xs text-green-400 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> {seedStatus.materials} פריטים קיימים</span>
                  ) : (
                    <span className="text-xs text-amber-400">{seedStatus.materials} פריטים קיימים</span>
                  )}
                </div>
              )}
              <Button
                size="sm"
                className="w-full"
                onClick={() => runSeed("factory-seed/materials", "חומרי גלם")}
                disabled={seedLoading === "factory-seed/materials"}
              >
                {seedLoading === "factory-seed/materials" ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Package className="w-4 h-4 ml-2" />}
                טען 60 SKU
              </Button>
            </Card>
          </div>

          <Card className="p-4 border-primary/20 bg-primary/5">
            <div className="flex items-center gap-3 mb-4">
              <Factory className="w-5 h-5 text-primary" />
              <div>
                <h4 className="font-semibold text-sm">טעינת כל הנתונים</h4>
                <p className="text-xs text-muted-foreground">טוען את כל נתוני הבסיס בפעולה אחת — עובדים, ספקים, חומרי גלם</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button
                onClick={() => runSeed("factory-seed/all", "נתוני מפעל")}
                disabled={!!seedLoading}
                className="flex items-center gap-2"
              >
                {seedLoading === "factory-seed/all" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Factory className="w-4 h-4" />}
                טען הכל
              </Button>
              <Button
                variant="outline"
                onClick={loadSeedStatus}
                className="flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                בדוק סטטוס
              </Button>
            </div>

            {seedStatus && (
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="text-center p-2 rounded-lg bg-card border border-border">
                  <div className="text-lg font-bold text-blue-400">{seedStatus.employees}</div>
                  <div className="text-xs text-muted-foreground">עובדים</div>
                </div>
                <div className="text-center p-2 rounded-lg bg-card border border-border">
                  <div className="text-lg font-bold text-green-400">{seedStatus.suppliers}</div>
                  <div className="text-xs text-muted-foreground">ספקים</div>
                </div>
                <div className="text-center p-2 rounded-lg bg-card border border-border">
                  <div className="text-lg font-bold text-purple-400">{seedStatus.materials}</div>
                  <div className="text-xs text-muted-foreground">חומרי גלם</div>
                </div>
              </div>
            )}

            <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-200">
                פעולה זו מוגנת ומצריכה הרשאות מנהל מערכת. הנתונים מוכנסים רק אם הטבלאות ריקות. 
                לא ניתן לשחזר נתונים שיוחלפו. יש לבצע גיבוי לפני הפעלה בסביבת ייצור.
              </p>
            </div>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="system-settings" />
        <RelatedRecords entityType="system-settings" />
      </div>
    </div>
  );
}
