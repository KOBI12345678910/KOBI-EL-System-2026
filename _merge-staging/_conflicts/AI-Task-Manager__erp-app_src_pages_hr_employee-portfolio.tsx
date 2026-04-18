import { useState, useEffect } from "react";
import { useBreadcrumbLabel } from "@/components/layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import {
  User, FileText, FolderOpen, DollarSign, ChevronLeft, Phone, Mail,
  MapPin, CalendarDays, Building2, Briefcase, Award, Clock, Shield,
  CreditCard, Heart, AlertCircle, Users, Save, Car, UtensilsCrossed,
  Star, CheckCircle, XCircle, AlertTriangle, Plus, Trash2, X, Satellite, Navigation
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { authJson, authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import AttachmentsSection from "@/components/attachments-section";
import SkillsMatrix from "./skills-matrix";
import EmploymentHistory from "./employment-history";

const API = "/api";

function fmt(n: number) {
  return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n);
}

const TABS = [
  { key: "profile", label: "פרופיל", icon: User },
  { key: "employment", label: "תנאי העסקה", icon: Briefcase },
  { key: "emp_history", label: "היסטוריית העסקה", icon: Clock },
  { key: "skills", label: "מטריצת מיומנויות", icon: Star },
  { key: "certifications", label: "הסמכות", icon: Award },
  { key: "compliance", label: "ציות", icon: Shield },
  { key: "benefits", label: "הטבות", icon: Heart },
  { key: "emergency", label: "קשרי חירום", icon: AlertCircle },
  { key: "documents", label: "מסמכים", icon: FileText },
  { key: "financials", label: "נתונים כספיים", icon: DollarSign },
  { key: "attachments", label: "קבצים", icon: FolderOpen },
  { key: "history", label: "פעילות", icon: Clock },
];

export default function EmployeePortfolio() {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState("profile");
  const [benefitsEditing, setBenefitsEditing] = useState(false);
  const [benefitsForm, setBenefitsForm] = useState<Record<string, string>>({});
  const [benefitsSaving, setBenefitsSaving] = useState(false);
  const { setLabel } = useBreadcrumbLabel();

  const { data, isLoading } = useQuery({
    queryKey: ["hr-employee", id],
    queryFn: () => authJson(`${API}/hr/employees/${id}`),
    enabled: !!id,
  });

  useEffect(() => {
    if (data?.full_name || data?.name) {
      setLabel(data.full_name || data.name);
    }
  }, [data, setLabel]);

  const { data: benefitsData, refetch: refetchBenefits } = useQuery({
    queryKey: ["hr-employee-benefits", id],
    queryFn: () => authJson(`${API}/hr/benefits/${id}`),
    enabled: !!id && activeTab === "benefits",
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  const emp = data?.employee;
  if (!emp) {
    return <div className="text-center py-20 text-muted-foreground">עובד לא נמצא</div>;
  }

  const d = emp.data || {};
  const attendance = data?.attendance || [];
  const shifts = data?.shifts || [];

  const statusColors: Record<string, string> = {
    active: "bg-green-500/20 text-green-400",
    on_leave: "bg-yellow-500/20 text-yellow-400",
    terminated: "bg-red-500/20 text-red-400",
    probation: "bg-blue-500/20 text-blue-400",
  };
  const statusLabels: Record<string, string> = {
    active: "פעיל",
    on_leave: "בחופשה",
    terminated: "סיום העסקה",
    probation: "ניסיון",
    draft: "טיוטה",
  };

  const hireDate = d.hire_date ? new Date(d.hire_date) : null;
  const seniority = hireDate
    ? Math.floor((Date.now() - hireDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : 0;
  const seniorityMonths = hireDate
    ? Math.floor((Date.now() - hireDate.getTime()) / (30 * 24 * 60 * 60 * 1000)) % 12
    : 0;

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Link href="/hr" className="flex items-center gap-1 hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" />
          משאבי אנוש
        </Link>
        <span>/</span>
        <Link href="/hr/employees" className="hover:text-foreground transition-colors">עובדים</Link>
        <span>/</span>
        <span className="text-foreground">{d.full_name || d.first_name || "תיק עובד"}</span>
      </div>

      <div className="flex items-start gap-6">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center text-xl sm:text-3xl font-bold text-primary">
          {(d.full_name || d.first_name || "?").charAt(0)}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-lg sm:text-2xl font-bold text-foreground">
              {d.full_name || `${d.first_name || ""} ${d.last_name || ""}`.trim() || "ללא שם"}
            </h1>
            <Badge className={statusColors[emp.status] || "bg-muted/20 text-muted-foreground"}>
              {statusLabels[emp.status] || emp.status}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">
            {d.job_title || d.role || "—"} {d.department ? `• ${d.department}` : ""}
          </p>
          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
            {d.employee_id && <span>מס׳ עובד: {d.employee_id}</span>}
            {d.id_number && <span>ת.ז: {d.id_number}</span>}
            {hireDate && <span>ותק: {seniority > 0 ? `${seniority} שנים` : ""} {seniorityMonths > 0 ? `${seniorityMonths} חודשים` : ""}</span>}
          </div>
        </div>
      </div>

      <div className="flex gap-1 bg-card border border-border rounded-xl p-1">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}>
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "profile" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <User className="w-4 h-4 text-primary" />
                פרטים אישיים
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: "שם מלא", value: d.full_name || `${d.first_name || ""} ${d.last_name || ""}`.trim() },
                { label: "שם באנגלית", value: d.full_name_en },
                { label: "תעודת זהות", value: d.id_number },
                { label: "תאריך לידה", value: d.birth_date },
                { label: "מגדר", value: d.gender === "male" ? "זכר" : d.gender === "female" ? "נקבה" : d.gender },
                { label: "מצב משפחתי", value: d.marital_status },
                { label: "מספר ילדים", value: d.children_count },
                { label: "כתובת", value: d.address },
                { label: "עיר", value: d.city },
              ].map((item, i) => item.value ? (
                <div key={i} className="flex justify-between py-1.5 border-b border-border/20 last:border-0">
                  <span className="text-sm text-muted-foreground">{item.label}</span>
                  <span className="text-sm text-foreground font-medium">{item.value}</span>
                </div>
              ) : null)}
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Phone className="w-4 h-4 text-primary" />
                פרטי קשר
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: "טלפון", value: d.phone, icon: Phone },
                { label: "טלפון נוסף", value: d.phone2 },
                { label: "אימייל", value: d.email, icon: Mail },
                { label: "כתובת", value: d.address, icon: MapPin },
                { label: "עיר", value: d.city },
                { label: "מיקוד", value: d.zip_code },
              ].map((item, i) => item.value ? (
                <div key={i} className="flex justify-between py-1.5 border-b border-border/20 last:border-0">
                  <span className="text-sm text-muted-foreground">{item.label}</span>
                  <span className="text-sm text-foreground">{item.value}</span>
                </div>
              ) : null)}
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400" />
                איש קשר לחירום
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: "שם", value: d.emergency_contact_name },
                { label: "טלפון", value: d.emergency_contact_phone },
                { label: "קרבה", value: d.emergency_contact_relation },
              ].map((item, i) => item.value ? (
                <div key={i} className="flex justify-between py-1.5 border-b border-border/20 last:border-0">
                  <span className="text-sm text-muted-foreground">{item.label}</span>
                  <span className="text-sm text-foreground">{item.value}</span>
                </div>
              ) : null)}
              {!d.emergency_contact_name && <p className="text-sm text-muted-foreground text-center py-2">לא הוגדר</p>}
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" />
                מידע ארגוני
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: "מחלקה", value: d.department },
                { label: "תפקיד", value: d.job_title || d.role },
                { label: "מנהל ישיר", value: d.manager_name },
                { label: "סניף", value: d.branch },
                { label: "קו ייצור", value: d.production_line },
              ].map((item, i) => item.value ? (
                <div key={i} className="flex justify-between py-1.5 border-b border-border/20 last:border-0">
                  <span className="text-sm text-muted-foreground">{item.label}</span>
                  <span className="text-sm text-foreground">{item.value}</span>
                </div>
              ) : null)}
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Satellite className="w-4 h-4 text-primary" />
                {"GPS ומיקום"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between py-1.5 border-b border-border/20">
                <span className="text-sm text-muted-foreground">{"סטטוס GPS"}</span>
                <span className="text-sm font-medium">
                  {(d.gps_enabled ?? true) !== false ? (
                    <span className="flex items-center gap-1.5 text-green-500">
                      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      {"פעיל"}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-red-400">
                      <span className="w-2 h-2 rounded-full bg-red-400" />
                      {"כבוי"}
                    </span>
                  )}
                </span>
              </div>
              {d.gps_device_id && (
                <div className="flex justify-between py-1.5 border-b border-border/20">
                  <span className="text-sm text-muted-foreground">{"מזהה מכשיר"}</span>
                  <span className="text-sm text-foreground font-mono">{d.gps_device_id}</span>
                </div>
              )}
              <div className="flex justify-between py-1.5 border-b border-border/20">
                <span className="text-sm text-muted-foreground">{"נראה במפת צוות"}</span>
                <span className="text-sm text-foreground">{(d.gps_enabled ?? true) !== false ? "כן" : "לא"}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-sm text-muted-foreground">{"רישום אוטומטי"}</span>
                <span className="text-sm text-green-500 font-medium">{"פעיל"}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "employment" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-primary" />
                תנאי העסקה
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: "סוג העסקה", value: d.employment_type === "full_time" ? "משרה מלאה" : d.employment_type === "part_time" ? "חלקית" : d.employment_type === "contractor" ? "קבלן" : d.employment_type },
                { label: "תאריך תחילת עבודה", value: d.hire_date },
                { label: "סוג חוזה", value: d.contract_type },
                { label: "תקופת ניסיון", value: d.probation_period ? `${d.probation_period} חודשים` : null },
                { label: "סיום ניסיון", value: d.probation_end_date },
                { label: "היקף משרה", value: d.work_percentage ? `${d.work_percentage}%` : null },
                { label: "ימי עבודה בשבוע", value: d.work_days_per_week },
                { label: "שעות שבועיות", value: d.weekly_hours },
              ].map((item, i) => item.value ? (
                <div key={i} className="flex justify-between py-1.5 border-b border-border/20 last:border-0">
                  <span className="text-sm text-muted-foreground">{item.label}</span>
                  <span className="text-sm text-foreground">{item.value}</span>
                </div>
              ) : null)}
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-primary" />
                פרטי בנק
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: "בנק", value: d.bank_name },
                { label: "מספר בנק", value: d.bank_number },
                { label: "סניף", value: d.bank_branch },
                { label: "מספר חשבון", value: d.bank_account },
              ].map((item, i) => item.value ? (
                <div key={i} className="flex justify-between py-1.5 border-b border-border/20 last:border-0">
                  <span className="text-sm text-muted-foreground">{item.label}</span>
                  <span className="text-sm text-foreground">{item.value}</span>
                </div>
              ) : null)}
              {!d.bank_name && <p className="text-sm text-muted-foreground text-center py-2">לא הוגדרו פרטי בנק</p>}
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Heart className="w-4 h-4 text-red-400" />
                הטבות סוציאליות
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: "קופת פנסיה", value: d.pension_fund },
                { label: "הפרשת עובד", value: d.pension_employee_pct ? `${d.pension_employee_pct}%` : null },
                { label: "הפרשת מעסיק", value: d.pension_employer_pct ? `${d.pension_employer_pct}%` : null },
                { label: "קרן השתלמות", value: d.training_fund },
                { label: "ביטוח מנהלים", value: d.managers_insurance },
                { label: "ימי חופשה שנתיים", value: d.annual_vacation_days },
                { label: "ימי מחלה צבורים", value: d.sick_days_balance },
                { label: "ימי חופשה נותרים", value: d.vacation_days_remaining },
              ].map((item, i) => item.value ? (
                <div key={i} className="flex justify-between py-1.5 border-b border-border/20 last:border-0">
                  <span className="text-sm text-muted-foreground">{item.label}</span>
                  <span className="text-sm text-foreground">{item.value}</span>
                </div>
              ) : null)}
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Award className="w-4 h-4 text-primary" />
                הישגים ויעדים
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: "ציון הערכה אחרון", value: d.last_review_score },
                { label: "תאריך הערכה אחרון", value: d.last_review_date },
                { label: "יעד השגת מכירות", value: d.sales_target ? fmt(Number(d.sales_target)) : null },
                { label: "פרויקטים שהושלמו", value: d.projects_completed },
                { label: "שביעות רצון לקוחות", value: d.client_satisfaction ? `${d.client_satisfaction}/5` : null },
                { label: "הכשרות שעבר", value: d.training_completed },
              ].map((item, i) => item.value ? (
                <div key={i} className="flex justify-between py-1.5 border-b border-border/20 last:border-0">
                  <span className="text-sm text-muted-foreground">{item.label}</span>
                  <span className="text-sm text-foreground">{item.value}</span>
                </div>
              ) : null)}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "benefits" && (() => {
        const b = benefitsData || {};
        const startEditing = () => {
          setBenefitsForm({
            health_insurance_type: b.healthInsuranceType || "",
            pension_fund: b.pensionFund || "",
            pension_employee_pct: String(b.pensionEmployeePct || ""),
            pension_employer_pct: String(b.pensionEmployerPct || ""),
            training_fund: b.trainingFund || "",
            training_fund_pct: String(b.trainingFundPct || ""),
            car_make: b.carMake || "",
            car_model: b.carModel || "",
            car_value: String(b.carValue || ""),
            phone_allowance: String(b.phoneAllowance || ""),
            meal_allowance: String(b.mealAllowance || ""),
            managers_insurance: b.managersInsurance || "",
            annual_vacation_days: String(b.annualVacationDays || ""),
            sick_days_balance: String(b.sickDaysBalance || ""),
            vacation_days_remaining: String(b.vacationDaysRemaining || ""),
          });
          setBenefitsEditing(true);
        };
        const saveBenefits = async () => {
          setBenefitsSaving(true);
          try {
            const body: Record<string, unknown> = {};
            const numericFields = ["pension_employee_pct", "pension_employer_pct", "training_fund_pct", "car_value", "phone_allowance", "meal_allowance", "annual_vacation_days", "sick_days_balance", "vacation_days_remaining"];
            for (const [key, val] of Object.entries(benefitsForm)) {
              body[key] = numericFields.includes(key) ? (val ? Number(val) : 0) : val;
            }
            const res = await authFetch(`${API}/hr/benefits/${id}`, { method: "PUT", body: JSON.stringify(body) });
            if (!res.ok) {
              const errData = await res.json().catch(() => ({ error: "שגיאת שרת" }));
              throw new Error(errData.error || `שגיאה ${res.status}`);
            }
            setBenefitsEditing(false);
            refetchBenefits();
          } catch (err) { alert(err instanceof Error ? err.message : "שגיאה בשמירה"); }
          finally { setBenefitsSaving(false); }
        };

        return (
          <div className="space-y-4 sm:space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Heart className="w-5 h-5 text-red-400" />
                חבילת הטבות
              </h3>
              {!benefitsEditing ? (
                <button onClick={startEditing} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90">
                  עריכה
                </button>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => setBenefitsEditing(false)} className="px-4 py-2 border border-border rounded-xl text-sm hover:bg-muted">ביטול</button>
                  <button onClick={saveBenefits} disabled={benefitsSaving} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                    <Save className="w-4 h-4" />
                    {benefitsSaving ? "שומר..." : "שמור"}
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Shield className="w-4 h-4 text-blue-400" />
                    ביטוח בריאות ופנסיה
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {benefitsEditing ? (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-muted-foreground">סוג ביטוח בריאות</label>
                        <select value={benefitsForm.health_insurance_type} onChange={e => setBenefitsForm(f => ({ ...f, health_insurance_type: e.target.value }))} className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-xl text-sm">
                          <option value="">— בחר —</option>
                          <option value="בסיסי">בסיסי</option>
                          <option value="כסף">כסף</option>
                          <option value="זהב">זהב</option>
                          <option value="פלטינום">פלטינום</option>
                          <option value="ללא">ללא</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">קופת פנסיה</label>
                        <input value={benefitsForm.pension_fund} onChange={e => setBenefitsForm(f => ({ ...f, pension_fund: e.target.value }))} className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-xl text-sm" />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-muted-foreground">הפרשת עובד (%)</label>
                          <input type="number" value={benefitsForm.pension_employee_pct} onChange={e => setBenefitsForm(f => ({ ...f, pension_employee_pct: e.target.value }))} className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-xl text-sm" />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">הפרשת מעסיק (%)</label>
                          <input type="number" value={benefitsForm.pension_employer_pct} onChange={e => setBenefitsForm(f => ({ ...f, pension_employer_pct: e.target.value }))} className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-xl text-sm" />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">קרן השתלמות</label>
                        <input value={benefitsForm.training_fund} onChange={e => setBenefitsForm(f => ({ ...f, training_fund: e.target.value }))} className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-xl text-sm" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">אחוז קרן השתלמות (%)</label>
                        <input type="number" value={benefitsForm.training_fund_pct} onChange={e => setBenefitsForm(f => ({ ...f, training_fund_pct: e.target.value }))} className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-xl text-sm" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">ביטוח מנהלים</label>
                        <input value={benefitsForm.managers_insurance} onChange={e => setBenefitsForm(f => ({ ...f, managers_insurance: e.target.value }))} className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-xl text-sm" />
                      </div>
                    </div>
                  ) : (
                    <>
                      {[
                        { label: "סוג ביטוח בריאות", value: b.healthInsuranceType },
                        { label: "קופת פנסיה", value: b.pensionFund },
                        { label: "הפרשת עובד", value: b.pensionEmployeePct ? `${b.pensionEmployeePct}%` : null },
                        { label: "הפרשת מעסיק", value: b.pensionEmployerPct ? `${b.pensionEmployerPct}%` : null },
                        { label: "קרן השתלמות", value: b.trainingFund },
                        { label: "אחוז קרן השתלמות", value: b.trainingFundPct ? `${b.trainingFundPct}%` : null },
                        { label: "ביטוח מנהלים", value: b.managersInsurance },
                      ].map((item, i) => item.value ? (
                        <div key={i} className="flex justify-between py-1.5 border-b border-border/20 last:border-0">
                          <span className="text-sm text-muted-foreground">{item.label}</span>
                          <span className="text-sm text-foreground font-medium">{item.value}</span>
                        </div>
                      ) : null)}
                      {!b.healthInsuranceType && !b.pensionFund && !b.pensionEmployeePct && (
                        <p className="text-sm text-muted-foreground text-center py-4">לא הוגדרו הטבות ביטוח ופנסיה</p>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Car className="w-4 h-4 text-orange-400" />
                    רכב, טלפון וארוחות
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {benefitsEditing ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-muted-foreground">יצרן רכב</label>
                          <input value={benefitsForm.car_make} onChange={e => setBenefitsForm(f => ({ ...f, car_make: e.target.value }))} className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-xl text-sm" />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">דגם רכב</label>
                          <input value={benefitsForm.car_model} onChange={e => setBenefitsForm(f => ({ ...f, car_model: e.target.value }))} className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-xl text-sm" />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">שווי רכב (₪)</label>
                        <input type="number" value={benefitsForm.car_value} onChange={e => setBenefitsForm(f => ({ ...f, car_value: e.target.value }))} className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-xl text-sm" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">קצובת טלפון (₪)</label>
                        <input type="number" value={benefitsForm.phone_allowance} onChange={e => setBenefitsForm(f => ({ ...f, phone_allowance: e.target.value }))} className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-xl text-sm" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">קצובת ארוחות (₪)</label>
                        <input type="number" value={benefitsForm.meal_allowance} onChange={e => setBenefitsForm(f => ({ ...f, meal_allowance: e.target.value }))} className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-xl text-sm" />
                      </div>
                    </div>
                  ) : (
                    <>
                      {[
                        { label: "רכב חברה", value: b.carMake ? `${b.carMake} ${b.carModel || ""}`.trim() : null },
                        { label: "שווי רכב", value: b.carValue ? fmt(b.carValue) : null },
                        { label: "קצובת טלפון", value: b.phoneAllowance ? fmt(b.phoneAllowance) : null },
                        { label: "קצובת ארוחות", value: b.mealAllowance ? fmt(b.mealAllowance) : null },
                      ].map((item, i) => item.value ? (
                        <div key={i} className="flex justify-between py-1.5 border-b border-border/20 last:border-0">
                          <span className="text-sm text-muted-foreground">{item.label}</span>
                          <span className="text-sm text-foreground font-medium">{item.value}</span>
                        </div>
                      ) : null)}
                      {!b.carMake && !b.carValue && !b.phoneAllowance && !b.mealAllowance && (
                        <p className="text-sm text-muted-foreground text-center py-4">לא הוגדרו הטבות רכב וקצובות</p>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-green-400" />
                    חופשות ומחלה
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {benefitsEditing ? (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-muted-foreground">ימי חופשה שנתיים</label>
                        <input type="number" value={benefitsForm.annual_vacation_days} onChange={e => setBenefitsForm(f => ({ ...f, annual_vacation_days: e.target.value }))} className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-xl text-sm" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">ימי מחלה צבורים</label>
                        <input type="number" value={benefitsForm.sick_days_balance} onChange={e => setBenefitsForm(f => ({ ...f, sick_days_balance: e.target.value }))} className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-xl text-sm" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">ימי חופשה נותרים</label>
                        <input type="number" value={benefitsForm.vacation_days_remaining} onChange={e => setBenefitsForm(f => ({ ...f, vacation_days_remaining: e.target.value }))} className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-xl text-sm" />
                      </div>
                    </div>
                  ) : (
                    <>
                      {[
                        { label: "ימי חופשה שנתיים", value: b.annualVacationDays ? String(b.annualVacationDays) : null },
                        { label: "ימי מחלה צבורים", value: b.sickDaysBalance ? String(b.sickDaysBalance) : null },
                        { label: "ימי חופשה נותרים", value: b.vacationDaysRemaining ? String(b.vacationDaysRemaining) : null },
                      ].map((item, i) => item.value ? (
                        <div key={i} className="flex justify-between py-1.5 border-b border-border/20 last:border-0">
                          <span className="text-sm text-muted-foreground">{item.label}</span>
                          <span className="text-sm text-foreground font-medium">{item.value}</span>
                        </div>
                      ) : null)}
                      {!b.annualVacationDays && !b.sickDaysBalance && (
                        <p className="text-sm text-muted-foreground text-center py-4">לא הוגדרו נתוני חופשות</p>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        );
      })()}

      {activeTab === "projects" && (
        <div className="space-y-4">
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-primary" />
                היסטוריית פרויקטים ותלושי שכר
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(data?.projects || []).length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <FolderOpen className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">אין היסטוריית פרויקטים</p>
                  <p className="text-xs mt-1">תלושי שכר ופרויקטים יופיעו כאן לאחר ריצת שכר</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(data?.projects || []).map((p: { period: string; grossSalary: number; netSalary: number; department: string; jobTitle: string }, i: number) => (
                    <div key={i} className="flex items-center justify-between py-3 px-4 bg-muted/30 rounded-xl">
                      <div className="flex items-center gap-3">
                        <CalendarDays className="w-5 h-5 text-primary" />
                        <div>
                          <p className="text-sm font-medium text-foreground">{p.period || `תקופה ${i + 1}`}</p>
                          <p className="text-xs text-muted-foreground">{p.department} {p.jobTitle ? `• ${p.jobTitle}` : ""}</p>
                        </div>
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-medium text-green-400">{fmt(p.netSalary)}</p>
                        <p className="text-xs text-muted-foreground">ברוטו: {fmt(p.grossSalary)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          {(data?.agreements || []).length > 0 && (
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-primary" />
                  הסכמי קבלן
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(data?.agreements || []).map((a: { id: number; data: Record<string, string>; status: string }, i: number) => (
                    <div key={i} className="flex items-center justify-between py-3 px-4 bg-muted/30 rounded-xl">
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-blue-400" />
                        <div>
                          <p className="text-sm font-medium text-foreground">{a.data?.contractor_name || `הסכם ${i + 1}`}</p>
                          <p className="text-xs text-muted-foreground">
                            {a.data?.payment_model || "קבוע"} • {a.data?.specialty || ""}
                          </p>
                        </div>
                      </div>
                      <Badge className={a.status === "active" ? "bg-green-500/20 text-green-400" : "bg-muted/20 text-muted-foreground"}>
                        {a.status === "active" ? "פעיל" : a.status || "טיוטה"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === "documents" && (
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-primary" />
              מסמכים ותיעוד
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { name: "חוזה העסקה", type: d.contract_type || "חוזה", date: d.hire_date, exists: !!d.contract_signed },
                { name: "טופס 101", type: "מס", date: d.form_101_date, exists: !!d.form_101_submitted },
                { name: "אישור פנסיה", type: "סוציאלי", date: null, exists: !!d.pension_fund },
                { name: "תעודות הכשרה", type: "הכשרה", date: d.last_training_date, exists: !!d.training_completed },
                { name: "הערכת ביצועים", type: "הערכה", date: d.last_review_date, exists: !!d.last_review_score },
              ].map((doc, i) => (
                <div key={i} className="flex items-center justify-between py-3 px-4 bg-muted/30 rounded-xl">
                  <div className="flex items-center gap-3">
                    <FileText className={`w-5 h-5 ${doc.exists ? "text-green-400" : "text-muted-foreground"}`} />
                    <div>
                      <p className="text-sm font-medium text-foreground">{doc.name}</p>
                      <p className="text-xs text-muted-foreground">{doc.type} {doc.date ? `• ${doc.date}` : ""}</p>
                    </div>
                  </div>
                  <Badge className={doc.exists ? "bg-green-500/20 text-green-400" : "bg-muted/20 text-muted-foreground"}>
                    {doc.exists ? "קיים" : "חסר"}
                  </Badge>
                </div>
              ))}
              {d.documents && Array.isArray(d.documents) && d.documents.map((doc: { name?: string; title?: string; type?: string; date?: string }, i: number) => (
                <div key={`custom-${i}`} className="flex items-center justify-between py-3 px-4 bg-muted/30 rounded-xl">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-blue-400" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{doc.name || doc.title || `מסמך ${i + 1}`}</p>
                      <p className="text-xs text-muted-foreground">{doc.type || "מסמך"} {doc.date ? `• ${doc.date}` : ""}</p>
                    </div>
                  </div>
                  <Badge className="bg-blue-500/20 text-blue-400">מצורף</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === "attendance" && (
        <div className="space-y-4">
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                נוכחות אחרונה
              </CardTitle>
            </CardHeader>
            <CardContent>
              {attendance.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">אין רשומות נוכחות</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50 text-muted-foreground">
                        <th className="text-right py-2 px-3">תאריך</th>
                        <th className="text-right py-2 px-3">סוג</th>
                        <th className="text-right py-2 px-3">כניסה</th>
                        <th className="text-right py-2 px-3">יציאה</th>
                        <th className="text-right py-2 px-3">שעות</th>
                        <th className="text-right py-2 px-3">שעות נוספות</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendance.map((a: { id: number; createdAt: string; status: string; data: Record<string, string> }) => {
                        const ad = a.data || {};
                        const typeColors: Record<string, string> = {
                          present: "text-green-400", absent: "text-red-400",
                          late: "text-yellow-400", sick_leave: "text-purple-400", vacation: "text-blue-400",
                        };
                        const typeLabels: Record<string, string> = {
                          present: "נוכח", absent: "חסר", late: "איחור",
                          sick_leave: "מחלה", vacation: "חופשה",
                        };
                        return (
                          <tr key={a.id} className="border-b border-border/20">
                            <td className="py-2 px-3">{ad.date || new Date(a.createdAt).toLocaleDateString("he-IL")}</td>
                            <td className={`py-2 px-3 ${typeColors[ad.type] || "text-muted-foreground"}`}>{typeLabels[ad.type] || ad.type || "—"}</td>
                            <td className="py-2 px-3">{ad.check_in || "—"}</td>
                            <td className="py-2 px-3">{ad.check_out || "—"}</td>
                            <td className="py-2 px-3">{ad.total_hours || "—"}</td>
                            <td className="py-2 px-3 text-yellow-400">{ad.overtime_hours || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-primary" />
                משמרות
              </CardTitle>
            </CardHeader>
            <CardContent>
              {shifts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">אין משמרות מתוכננות</p>
              ) : (
                <div className="space-y-2">
                  {shifts.map((s: { id: number; status: string; data: Record<string, string> }) => {
                    const sd = s.data || {};
                    return (
                      <div key={s.id} className="flex items-center justify-between py-3 px-4 bg-muted/30 rounded-xl">
                        <div>
                          <p className="text-sm font-medium text-foreground">{sd.shift_name || sd.template_name || "משמרת"}</p>
                          <p className="text-xs text-muted-foreground">{sd.shift_date || "—"} • {sd.start_time || "—"} - {sd.end_time || "—"}</p>
                        </div>
                        <Badge className={s.status === "active" ? "bg-green-500/20 text-green-400" : "bg-muted/20 text-muted-foreground"}>
                          {sd.shift_type || s.status || "—"}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "financials" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                שכר ותגמולים
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: "שכר בסיס", value: d.base_salary ? fmt(Number(d.base_salary)) : null },
                { label: "שעות נוספות (חודשי)", value: d.overtime_hours },
                { label: "בונוס", value: d.bonus ? fmt(Number(d.bonus)) : null },
                { label: "עמלות", value: d.commission ? fmt(Number(d.commission)) : null },
                { label: "קצובת נסיעות", value: d.travel_allowance ? fmt(Number(d.travel_allowance)) : null },
                { label: "קצובת טלפון", value: d.phone_allowance ? fmt(Number(d.phone_allowance)) : null },
                { label: "שווי רכב", value: d.car_value ? fmt(Number(d.car_value)) : null },
              ].map((item, i) => item.value ? (
                <div key={i} className="flex justify-between py-1.5 border-b border-border/20 last:border-0">
                  <span className="text-sm text-muted-foreground">{item.label}</span>
                  <span className="text-sm text-foreground font-medium">{item.value}</span>
                </div>
              ) : null)}
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-400" />
                עלות מעסיק
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(() => {
                const base = Number(d.base_salary) || 0;
                const pensionEr = base * 0.065;
                const severance = base * 0.0833;
                const ni = base * 0.0371;
                const total = base + pensionEr + severance + ni;
                return [
                  { label: "שכר ברוטו", value: fmt(base) },
                  { label: "הפרשת פנסיה מעסיק (6.5%)", value: fmt(pensionEr) },
                  { label: "הפרשת פיצויים (8.33%)", value: fmt(severance) },
                  { label: "ביטוח לאומי מעסיק (3.71%)", value: fmt(ni) },
                  { label: "סה\"כ עלות מעסיק", value: fmt(total), bold: true },
                ].map((item, i) => (
                  <div key={i} className={`flex justify-between py-1.5 ${i < 4 ? "border-b border-border/20" : ""}`}>
                    <span className={`text-sm ${item.bold ? "text-foreground font-semibold" : "text-muted-foreground"}`}>{item.label}</span>
                    <span className={`text-sm ${item.bold ? "text-emerald-400 font-bold" : "text-foreground"}`}>{item.value}</span>
                  </div>
                ));
              })()}
            </CardContent>
          </Card>

          <Card className="border-border/50 md:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Award className="w-4 h-4 text-primary" />
                שווי עובד
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "הכנסה חודשית מעובד", value: d.monthly_revenue ? fmt(Number(d.monthly_revenue)) : "—", color: "text-green-400" },
                  { label: "עלות חודשית", value: d.base_salary ? fmt(Number(d.base_salary) * 1.25) : "—", color: "text-red-400" },
                  { label: "שווי נטו חודשי", value: d.monthly_revenue && d.base_salary ? fmt(Number(d.monthly_revenue) - Number(d.base_salary) * 1.25) : "—", color: "text-blue-400" },
                  { label: "ROI", value: d.monthly_revenue && d.base_salary ? `${Math.round(((Number(d.monthly_revenue) - Number(d.base_salary) * 1.25) / (Number(d.base_salary) * 1.25)) * 100)}%` : "—", color: "text-purple-400" },
                ].map((item, i) => (
                  <div key={i} className="text-center py-4 px-2 bg-muted/30 rounded-xl">
                    <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{item.label}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "emp_history" && (
        <EmploymentHistory employeeId={Number(id)} employeeName={d.full_name || d.first_name} />
      )}

      {activeTab === "skills" && (
        <SkillsMatrix
          employeeId={Number(id)}
          employeeName={d.full_name || d.first_name}
          department={d.department}
        />
      )}

      {activeTab === "certifications" && (
        <CertificationsTab employeeId={Number(id)} employeeData={d} />
      )}

      {activeTab === "compliance" && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Shield className="w-4 h-4 text-orange-400" />
            ציות ורגולציה
          </h3>
          <ComplianceAlerts employeeId={Number(id)} />
        </div>
      )}

      {activeTab === "emergency" && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400" />
            אנשי קשר לחירום
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              {
                label: "איש קשר ראשון",
                name: d.emergency_contact || d.emergency_contact_name,
                phone: d.emergency_phone || d.emergency_contact_phone,
                relation: d.emergency_relation || d.emergency_contact_relation,
                priority: 1,
              },
              {
                label: "איש קשר שני",
                name: d.emergency_contact2,
                phone: d.emergency_phone2,
                relation: d.emergency_relation2,
                priority: 2,
              },
            ].map((ec, i) => (
              <Card key={i} className={`border-border/50 ${!ec.name ? "opacity-50" : ""}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${ec.priority === 1 ? "bg-red-500/20 text-red-400" : "bg-muted/30 text-muted-foreground"}`}>
                      {ec.priority}
                    </span>
                    {ec.label}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {ec.name ? (
                    <div className="space-y-2">
                      <div className="flex justify-between py-1 border-b border-border/20">
                        <span className="text-xs text-muted-foreground">שם</span>
                        <span className="text-sm text-foreground font-medium">{ec.name}</span>
                      </div>
                      {ec.phone && (
                        <div className="flex justify-between py-1 border-b border-border/20">
                          <span className="text-xs text-muted-foreground">טלפון</span>
                          <a href={`tel:${ec.phone}`} className="text-sm text-blue-400 font-mono">{ec.phone}</a>
                        </div>
                      )}
                      {ec.relation && (
                        <div className="flex justify-between py-1">
                          <span className="text-xs text-muted-foreground">קרבה</span>
                          <span className="text-sm text-foreground">{ec.relation}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-2">לא הוגדר</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {activeTab === "attachments" && (
        <AttachmentsSection entityType="employees" entityId={Number(id)} />
      )}

      {activeTab === "history" && (
        <ActivityLog entityType="employees" entityId={Number(id)} />
      )}
    </div>
  );
}

interface CertRecord {
  id: number;
  cert_name: string;
  cert_type?: string;
  issuing_body?: string;
  cert_number?: string;
  issued_date?: string;
  expiry_date?: string;
  status: string;
  days_until_expiry?: number | string;
}

function CertificationsTab({ employeeId, employeeData: d }: { employeeId: number; employeeData: Record<string, unknown> }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const { data: apiCerts = [], isLoading } = useQuery<CertRecord[]>({
    queryKey: ["certifications", employeeId],
    queryFn: () => authJson(`${API}/certifications?employee_id=${employeeId}`),
    enabled: !!employeeId,
  });

  const addMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => authFetch(`${API}/certifications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["certifications", employeeId] });
      setShowForm(false);
      setForm({});
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (certId: number) => authFetch(`${API}/certifications/${certId}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["certifications", employeeId] }),
  });

  const schemaFields = [
    { label: "הכשרת בטיחות", expiry: d.safety_training_expiry as string | undefined },
    { label: "רישיון מלגזה", expiry: d.forklift_license === "true" || d.forklift_license === true ? d.forklift_license_expiry as string | undefined : undefined, active: d.forklift_license === "true" || d.forklift_license === true },
    { label: "רישיון עגורן", expiry: d.crane_license === "true" || d.crane_license === true ? d.crane_license_expiry as string | undefined : undefined, active: d.crane_license === "true" || d.crane_license === true },
    { label: "תעודת ריתוך", expiry: d.welding_certificate_expiry as string | undefined, active: !!d.welding_certificate },
    { label: "עבודה בגובה", expiry: d.heights_certificate_expiry as string | undefined, active: d.heights_certificate === "true" || d.heights_certificate === true },
    { label: "עזרה ראשונה", expiry: d.first_aid_expiry as string | undefined, active: d.first_aid_trained === "true" || d.first_aid_trained === true },
    { label: "בדיקה רפואית", expiry: d.medical_exam_expiry as string | undefined, active: !!d.medical_exam_date },
    { label: "רישיון מקצועי", expiry: d.professional_license_expiry as string | undefined, active: !!d.professional_license },
    { label: "דרכון", expiry: d.passport_expiry as string | undefined, active: !!d.passport_number },
    { label: "היתר עבודה", expiry: d.work_permit_expiry as string | undefined, active: !!d.work_permit },
    { label: "ויזה", expiry: d.visa_expiry as string | undefined, active: !!d.visa_type },
    { label: "היתר שהייה", expiry: d.residence_permit_expiry as string | undefined, active: !!d.residence_permit },
  ].filter(f => f.active !== false && (f.expiry || f.active));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Award className="w-4 h-4 text-primary" />
          הסמכות ורישיונות
        </h3>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/20 text-primary rounded-lg text-xs font-medium hover:bg-primary/30">
          <Plus className="w-3.5 h-3.5" />
          הוסף הסמכה
        </button>
      </div>

      {apiCerts.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">הסמכות ממערכת ניהול הסמכות</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {apiCerts.map(cert => {
              const days = cert.days_until_expiry !== undefined ? parseInt(String(cert.days_until_expiry)) : null;
              const isExpired = days !== null && days < 0;
              const isWarning = days !== null && days >= 0 && days <= 90;
              const bgColor = isExpired ? "bg-red-500/10 border-red-500/30" : isWarning ? "bg-yellow-500/10 border-yellow-500/30" : "bg-green-500/10 border-green-500/30";
              return (
                <div key={cert.id} className={`flex items-center gap-3 p-3 rounded-xl border ${bgColor}`}>
                  {isExpired ? <XCircle className="w-5 h-5 text-red-400 shrink-0" /> : isWarning ? <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0" /> : <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{cert.cert_name}</p>
                    <p className="text-xs text-muted-foreground">{cert.cert_type || cert.issuing_body || "—"}</p>
                    {cert.expiry_date && <p className={`text-xs mt-0.5 ${isExpired ? "text-red-400" : isWarning ? "text-yellow-400" : "text-green-400"}`}>{days !== null ? (isExpired ? `פג לפני ${Math.abs(days)} ימים` : `${days} ימים לפקיעה`) : ""} • {cert.expiry_date.slice(0, 10)}</p>}
                  </div>
                  <button onClick={() => deleteMutation.mutate(cert.id)} className="p-1 hover:bg-muted rounded-lg shrink-0">
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isLoading && <div className="flex justify-center py-4"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" /></div>}

      {schemaFields.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">מסמכים מנתוני עובד</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {schemaFields.map((cert, i) => {
              const expiryDate = cert.expiry ? new Date(cert.expiry) : null;
              const daysUntil = expiryDate ? Math.floor((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
              const isExpired = daysUntil !== null && daysUntil < 0;
              const isWarning = daysUntil !== null && daysUntil >= 0 && daysUntil <= 90;
              const bgColor = isExpired ? "bg-red-500/10 border-red-500/30" : isWarning ? "bg-yellow-500/10 border-yellow-500/30" : cert.expiry ? "bg-green-500/10 border-green-500/30" : "bg-muted/20 border-border/20";
              return (
                <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border ${bgColor}`}>
                  {isExpired ? <XCircle className="w-5 h-5 text-red-400 shrink-0" /> : isWarning ? <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0" /> : cert.expiry ? <CheckCircle className="w-5 h-5 text-green-400 shrink-0" /> : <CheckCircle className="w-5 h-5 text-muted-foreground shrink-0" />}
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{cert.label}</p>
                    {cert.expiry && (
                      <p className={`text-xs mt-0.5 ${isExpired ? "text-red-400" : isWarning ? "text-yellow-400" : "text-green-400"}`}>
                        {daysUntil !== null ? (isExpired ? `פג לפני ${Math.abs(daysUntil)} ימים` : `${daysUntil} ימים לפקיעה`) : ""}
                        <span className="text-muted-foreground mr-1">• {cert.expiry.slice(0, 10)}</span>
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {apiCerts.length === 0 && schemaFields.length === 0 && !isLoading && (
        <div className="text-center py-8 text-muted-foreground">
          <Award className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">אין הסמכות רשומות</p>
          <button onClick={() => setShowForm(true)} className="mt-2 px-4 py-2 bg-primary/20 text-primary rounded-xl text-sm">הוסף הסמכה ראשונה</button>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()} dir="rtl">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h2 className="text-base font-bold text-foreground">הוספת הסמכה</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-muted rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">שם הסמכה *</label>
                <input value={form.certName || ""} onChange={e => setForm(f => ({ ...f, certName: e.target.value }))} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm" placeholder="לדוגמה: רישיון עגורן, תעודת הסמכה ISO" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">סוג</label>
                  <input value={form.certType || ""} onChange={e => setForm(f => ({ ...f, certType: e.target.value }))} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">גוף מנפיק</label>
                  <input value={form.issuingBody || ""} onChange={e => setForm(f => ({ ...f, issuingBody: e.target.value }))} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">מספר תעודה</label>
                <input value={form.certNumber || ""} onChange={e => setForm(f => ({ ...f, certNumber: e.target.value }))} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">תאריך הנפקה</label>
                  <input type="date" value={form.issuedDate || ""} onChange={e => setForm(f => ({ ...f, issuedDate: e.target.value }))} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">תוקף</label>
                  <input type="date" value={form.expiryDate || ""} onChange={e => setForm(f => ({ ...f, expiryDate: e.target.value }))} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm" />
                </div>
              </div>
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">ביטול</button>
              <button
                onClick={() => addMutation.mutate({ employeeId, certName: form.certName, certType: form.certType, issuingBody: form.issuingBody, certNumber: form.certNumber, issuedDate: form.issuedDate, expiryDate: form.expiryDate })}
                disabled={!form.certName || addMutation.isPending}
                className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {addMutation.isPending ? "שומר..." : "שמור"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ComplianceAlerts({ employeeId }: { employeeId: number }) {
  const { data: alerts = [], isLoading } = useQuery<any[]>({
    queryKey: ["compliance-alerts-emp", employeeId],
    queryFn: () => authJson(`${API}/compliance-alerts?employee_id=${employeeId}&status=active`),
    enabled: !!employeeId,
  });

  const ALERT_TYPE_LABELS: Record<string, string> = {
    work_permit: "היתר עבודה",
    visa: "ויזה",
    residence_permit: "היתר שהייה",
    safety_training: "הכשרת בטיחות",
    forklift_license: "רישיון מלגזה",
    crane_license: "רישיון עגורן",
    welding_cert: "תעודת ריתוך",
    heights_cert: "עבודה בגובה",
    first_aid: "עזרה ראשונה",
    medical_exam: "בדיקה רפואית",
    professional_license: "רישיון מקצועי",
    passport: "דרכון",
  };

  if (isLoading) return <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>;

  if (!alerts.length) return (
    <div className="text-center py-8 text-muted-foreground">
      <CheckCircle className="w-10 h-10 mx-auto mb-2 text-green-400 opacity-70" />
      <p className="text-sm">אין התראות ציות פעילות</p>
      <p className="text-xs mt-1">כל המסמכים בתוקף</p>
    </div>
  );

  return (
    <div className="space-y-2">
      {alerts.map((alert: any) => {
        const days = parseInt(String(alert.days_until_expiry));
        const isExpired = days < 0;
        const isUrgent = days >= 0 && days <= 30;
        const isWarning = days > 30 && days <= 60;
        const borderClass = isExpired ? "border-red-500/30 bg-red-500/10" : isUrgent ? "border-red-500/20 bg-red-500/5" : isWarning ? "border-orange-500/20 bg-orange-500/5" : "border-yellow-500/20 bg-yellow-500/5";
        const dayText = isExpired ? `פג לפני ${Math.abs(days)} ימים` : `${days} ימים לפקיעה`;
        const dayColor = isExpired ? "text-red-400" : isUrgent ? "text-red-400" : isWarning ? "text-orange-400" : "text-yellow-400";

        return (
          <div key={alert.id} className={`flex items-center gap-3 p-3 rounded-xl border ${borderClass}`}>
            <AlertTriangle className={`w-4 h-4 shrink-0 ${dayColor}`} />
            <div className="flex-1">
              <p className="text-sm text-foreground font-medium">{ALERT_TYPE_LABELS[alert.alert_type] || alert.item_name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">פקיעה: {alert.expiry_date?.slice(0, 10)}</p>
            </div>
            <span className={`text-xs font-bold ${dayColor}`}>{dayText}</span>
          </div>
        );
      })}
    </div>
  );
}
