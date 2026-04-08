import { LoadingOverlay } from "@/components/ui/unified-states";
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Search, Edit2, X, Save, Loader2, Phone, Building2,
  AlertCircle, Shield, Flame, Wind, Siren, MapPin, Calendar,
  ClipboardList, Wrench, Trash2, Eye, ChevronDown, ChevronUp,
  CheckCircle2, Clock
} from "lucide-react";
import { authFetch } from "@/lib/utils";

const API = "/api";
const safeArr = (d: any) => Array.isArray(d) ? d : (d?.data ?? []);

// ─── TYPES ───────────────────────────────────────────────

interface EmergencyContact {
  id: number;
  contact_type: string;
  name: string;
  role?: string;
  organization?: string;
  phone_primary?: string;
  phone_secondary?: string;
  email?: string;
  available_hours?: string;
  priority?: number;
  is_active?: boolean;
  notes?: string;
}

interface EvacuationPlan {
  id: number;
  building: string;
  floor?: string;
  area_description?: string;
  assembly_point?: string;
  primary_exit?: string;
  secondary_exit?: string;
  warden_name?: string;
  warden_phone?: string;
  deputy_warden_name?: string;
  max_occupancy?: number;
  special_needs_procedure?: string;
  last_review_date?: string;
  next_review_date?: string;
  status?: string;
  notes?: string;
}

interface DrillSchedule {
  id: number;
  drill_type: string;
  title: string;
  description?: string;
  scheduled_date?: string;
  scheduled_time?: string;
  building?: string;
  frequency?: string;
  duration_minutes?: number;
  coordinator_name?: string;
  status?: string;
  notes?: string;
}

interface DrillRecord {
  id: number;
  drill_type: string;
  title: string;
  drill_date: string;
  actual_duration_minutes?: number;
  building?: string;
  participants_count?: number;
  coordinator_name?: string;
  evacuation_time_seconds?: number;
  issues_found?: string;
  improvement_items?: string;
  overall_rating?: string;
  status?: string;
}

interface EmergencyEquipment {
  id: number;
  equipment_type: string;
  equipment_id_tag?: string;
  description?: string;
  building?: string;
  floor?: string;
  location_description?: string;
  last_inspection_date?: string;
  next_inspection_date?: string;
  inspection_frequency_months?: number;
  inspector_name?: string;
  status?: string;
  condition?: string;
  quantity?: number;
  specification?: string;
  is_active?: boolean;
  notes?: string;
}

// ─── CONFIG ──────────────────────────────────────────────

const CONTACT_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  emergency: { label: "חירום", color: "bg-red-500/20 text-red-300" },
  internal: { label: "פנימי", color: "bg-blue-500/20 text-blue-300" },
  external: { label: "חיצוני", color: "bg-green-500/20 text-green-300" },
  medical: { label: "רפואי", color: "bg-purple-500/20 text-purple-300" },
};

const DRILL_TYPES: Record<string, { label: string; icon: any; color: string }> = {
  fire: { label: "שריפה", icon: Flame, color: "text-red-400" },
  chemical_spill: { label: "דליפה כימית", icon: Wind, color: "text-yellow-400" },
  earthquake: { label: "רעידת אדמה", icon: Siren, color: "text-orange-400" },
  medical: { label: "רפואי", icon: Shield, color: "text-blue-400" },
  security: { label: "ביטחוני", icon: Shield, color: "text-gray-400" },
  general: { label: "כללי", icon: AlertCircle, color: "text-muted-foreground" },
};

const EQUIPMENT_TYPES: Record<string, { label: string; icon: string }> = {
  fire_extinguisher: { label: "מטף כיבוי", icon: "🧯" },
  first_aid_kit: { label: "ערכת עזרה ראשונה", icon: "🩺" },
  eye_wash: { label: "תחנת שטיפת עיניים", icon: "👁️" },
  spill_kit: { label: "ערכת דליפות", icon: "🪣" },
  aed: { label: "דפיברילטור", icon: "⚡" },
  fire_hose: { label: "צינור כיבוי", icon: "🚿" },
  emergency_shower: { label: "מקלחת חירום", icon: "🚿" },
  oxygen_kit: { label: "ציוד חמצן", icon: "💨" },
  other: { label: "אחר", icon: "📦" },
};

const EQUIPMENT_STATUS: Record<string, string> = {
  operational: "bg-green-500/20 text-green-300",
  needs_inspection: "bg-yellow-500/20 text-yellow-300",
  out_of_service: "bg-red-500/20 text-red-300",
  maintenance: "bg-blue-500/20 text-blue-300",
};
const EQUIPMENT_STATUS_HE: Record<string, string> = {
  operational: "תקין", needs_inspection: "דרוש בדיקה",
  out_of_service: "מחוץ לשירות", maintenance: "בתחזוקה",
};

const RATING_CONFIG: Record<string, { label: string; color: string }> = {
  excellent: { label: "מצוין", color: "text-green-400" },
  good: { label: "טוב", color: "text-blue-400" },
  satisfactory: { label: "מספיק", color: "text-yellow-400" },
  needs_improvement: { label: "דורש שיפור", color: "text-red-400" },
};

const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString("he-IL") : "—";

// ─── MODALS / FORMS ──────────────────────────────────────

function ContactForm({ initial, onSave, onClose }: {
  initial: Partial<EmergencyContact>; onSave: (d: Partial<EmergencyContact>) => Promise<void>; onClose: () => void;
}) {
  const [form, setForm] = useState<Partial<EmergencyContact>>(initial);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof EmergencyContact, v: any) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="p-5" dir="rtl">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-foreground">{initial.id ? "עריכת איש קשר" : "הוספת איש קשר חירום"}</h3>
            <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">שם *</label>
                <Input value={form.name || ""} onChange={e => set("name", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">סוג</label>
                <select value={form.contact_type || "internal"} onChange={e => set("contact_type", e.target.value)}
                  className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                  {Object.entries(CONTACT_TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">עדיפות</label>
                <Input type="number" value={form.priority || 1} onChange={e => set("priority", parseInt(e.target.value))} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">תפקיד</label>
                <Input value={form.role || ""} onChange={e => set("role", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">ארגון</label>
                <Input value={form.organization || ""} onChange={e => set("organization", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">טלפון ראשי</label>
                <Input value={form.phone_primary || ""} onChange={e => set("phone_primary", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">טלפון נוסף</label>
                <Input value={form.phone_secondary || ""} onChange={e => set("phone_secondary", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">שעות זמינות</label>
                <Input value={form.available_hours || "24/7"} onChange={e => set("available_hours", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">אימייל</label>
                <Input value={form.email || ""} onChange={e => set("email", e.target.value)} className="bg-background/50 mt-1" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">הערות</label>
              <Input value={form.notes || ""} onChange={e => set("notes", e.target.value)} className="bg-background/50 mt-1" />
            </div>
          </div>
          <div className="flex gap-2 mt-4 justify-end">
            <Button variant="outline" onClick={onClose}>ביטול</Button>
            <Button disabled={saving || !form.name?.trim()} onClick={async () => {
              setSaving(true); try { await onSave(form); } finally { setSaving(false); }
            }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Save className="w-4 h-4 ml-1" />}שמירה
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EvacuationPlanForm({ initial, onSave, onClose }: {
  initial: Partial<EvacuationPlan>; onSave: (d: Partial<EvacuationPlan>) => Promise<void>; onClose: () => void;
}) {
  const [form, setForm] = useState<Partial<EvacuationPlan>>(initial);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof EvacuationPlan, v: any) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5" dir="rtl">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-foreground">{initial.id ? "עריכת תכנית פינוי" : "הוספת תכנית פינוי"}</h3>
            <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">בניין *</label>
                <Input value={form.building || ""} onChange={e => set("building", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">קומה</label>
                <Input value={form.floor || ""} onChange={e => set("floor", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">תיאור אזור</label>
                <Input value={form.area_description || ""} onChange={e => set("area_description", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">נקודת כינוס</label>
                <Input value={form.assembly_point || ""} onChange={e => set("assembly_point", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">כניסה ראשית לפינוי</label>
                <Input value={form.primary_exit || ""} onChange={e => set("primary_exit", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">כניסה חלופית לפינוי</label>
                <Input value={form.secondary_exit || ""} onChange={e => set("secondary_exit", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">אחמ"ש פינוי</label>
                <Input value={form.warden_name || ""} onChange={e => set("warden_name", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">טלפון אחמ"ש</label>
                <Input value={form.warden_phone || ""} onChange={e => set("warden_phone", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">ממלא מקום אחמ"ש</label>
                <Input value={form.deputy_warden_name || ""} onChange={e => set("deputy_warden_name", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">תפוסה מקסימלית</label>
                <Input type="number" value={form.max_occupancy || ""} onChange={e => set("max_occupancy", parseInt(e.target.value))} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">בדיקה אחרונה</label>
                <Input type="date" value={form.last_review_date || ""} onChange={e => set("last_review_date", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">בדיקה הבאה</label>
                <Input type="date" value={form.next_review_date || ""} onChange={e => set("next_review_date", e.target.value)} className="bg-background/50 mt-1" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">נוהל לצרכים מיוחדים</label>
              <textarea value={form.special_needs_procedure || ""} onChange={e => set("special_needs_procedure", e.target.value)}
                rows={2} className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1 resize-none" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">הערות</label>
              <Input value={form.notes || ""} onChange={e => set("notes", e.target.value)} className="bg-background/50 mt-1" />
            </div>
          </div>
          <div className="flex gap-2 mt-4 justify-end">
            <Button variant="outline" onClick={onClose}>ביטול</Button>
            <Button disabled={saving || !form.building?.trim()} onClick={async () => {
              setSaving(true); try { await onSave(form); } finally { setSaving(false); }
            }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Save className="w-4 h-4 ml-1" />}שמירה
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DrillForm({ initial, onSave, onClose, isDrillRecord }: {
  initial: Partial<DrillSchedule | DrillRecord>; onSave: (d: any) => Promise<void>; onClose: () => void; isDrillRecord?: boolean;
}) {
  const [form, setForm] = useState<any>(initial);
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5" dir="rtl">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-foreground">{initial.id ? "עריכה" : isDrillRecord ? "תיעוד תרגיל" : "תזמון תרגיל"}</h3>
            <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">כותרת *</label>
                <Input value={form.title || ""} onChange={e => set("title", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">סוג תרגיל</label>
                <select value={form.drill_type || "fire"} onChange={e => set("drill_type", e.target.value)}
                  className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                  {Object.entries(DRILL_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              {isDrillRecord ? (
                <div>
                  <label className="text-xs text-muted-foreground">תאריך ביצוע *</label>
                  <Input type="date" value={form.drill_date || ""} onChange={e => set("drill_date", e.target.value)} className="bg-background/50 mt-1" />
                </div>
              ) : (
                <div>
                  <label className="text-xs text-muted-foreground">תאריך מתוכנן</label>
                  <Input type="date" value={form.scheduled_date || ""} onChange={e => set("scheduled_date", e.target.value)} className="bg-background/50 mt-1" />
                </div>
              )}
              <div>
                <label className="text-xs text-muted-foreground">בניין</label>
                <Input value={form.building || ""} onChange={e => set("building", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">מנהל תרגיל</label>
                <Input value={form.coordinator_name || ""} onChange={e => set("coordinator_name", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              {isDrillRecord ? (
                <>
                  <div>
                    <label className="text-xs text-muted-foreground">מספר משתתפים</label>
                    <Input type="number" value={form.participants_count || 0} onChange={e => set("participants_count", parseInt(e.target.value))} className="bg-background/50 mt-1" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">זמן פינוי (שניות)</label>
                    <Input type="number" value={form.evacuation_time_seconds || ""} onChange={e => set("evacuation_time_seconds", parseInt(e.target.value))} className="bg-background/50 mt-1" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">משך בפועל (דקות)</label>
                    <Input type="number" value={form.actual_duration_minutes || ""} onChange={e => set("actual_duration_minutes", parseInt(e.target.value))} className="bg-background/50 mt-1" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">דירוג כולל</label>
                    <select value={form.overall_rating || "good"} onChange={e => set("overall_rating", e.target.value)}
                      className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                      {Object.entries(RATING_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="text-xs text-muted-foreground">תדירות</label>
                    <select value={form.frequency || "annual"} onChange={e => set("frequency", e.target.value)}
                      className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                      <option value="monthly">חודשי</option>
                      <option value="quarterly">רבעוני</option>
                      <option value="biannual">חצי שנתי</option>
                      <option value="annual">שנתי</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">משך מתוכנן (דקות)</label>
                    <Input type="number" value={form.duration_minutes || 30} onChange={e => set("duration_minutes", parseInt(e.target.value))} className="bg-background/50 mt-1" />
                  </div>
                </>
              )}
            </div>
            {isDrillRecord && (
              <>
                <div>
                  <label className="text-xs text-muted-foreground">ממצאים / בעיות</label>
                  <textarea value={form.issues_found || ""} onChange={e => set("issues_found", e.target.value)}
                    rows={2} className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1 resize-none" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">פריטי שיפור</label>
                  <textarea value={form.improvement_items || ""} onChange={e => set("improvement_items", e.target.value)}
                    rows={2} className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1 resize-none" />
                </div>
              </>
            )}
            <div>
              <label className="text-xs text-muted-foreground">תיאור / הערות</label>
              <textarea value={form.description || form.notes || ""} onChange={e => set(isDrillRecord ? "attendance_notes" : "description", e.target.value)}
                rows={2} className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1 resize-none" />
            </div>
          </div>
          <div className="flex gap-2 mt-4 justify-end">
            <Button variant="outline" onClick={onClose}>ביטול</Button>
            <Button disabled={saving || !form.title?.trim()} onClick={async () => {
              setSaving(true); try { await onSave(form); } finally { setSaving(false); }
            }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Save className="w-4 h-4 ml-1" />}שמירה
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EquipmentForm({ initial, onSave, onClose }: {
  initial: Partial<EmergencyEquipment>; onSave: (d: Partial<EmergencyEquipment>) => Promise<void>; onClose: () => void;
}) {
  const [form, setForm] = useState<Partial<EmergencyEquipment>>(initial);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof EmergencyEquipment, v: any) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5" dir="rtl">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-foreground">{initial.id ? "עריכת ציוד" : "הוספת ציוד חירום"}</h3>
            <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">סוג ציוד</label>
                <select value={form.equipment_type || "fire_extinguisher"} onChange={e => set("equipment_type", e.target.value)}
                  className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                  {Object.entries(EQUIPMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">תג/מזהה</label>
                <Input value={form.equipment_id_tag || ""} onChange={e => set("equipment_id_tag", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">תיאור</label>
                <Input value={form.description || ""} onChange={e => set("description", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">בניין</label>
                <Input value={form.building || ""} onChange={e => set("building", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">קומה</label>
                <Input value={form.floor || ""} onChange={e => set("floor", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">מיקום מדויק</label>
                <Input value={form.location_description || ""} onChange={e => set("location_description", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">סטטוס</label>
                <select value={form.status || "operational"} onChange={e => set("status", e.target.value)}
                  className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                  {Object.entries(EQUIPMENT_STATUS_HE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">כמות</label>
                <Input type="number" value={form.quantity || 1} onChange={e => set("quantity", parseInt(e.target.value))} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">בדיקה אחרונה</label>
                <Input type="date" value={form.last_inspection_date || ""} onChange={e => set("last_inspection_date", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">בדיקה הבאה</label>
                <Input type="date" value={form.next_inspection_date || ""} onChange={e => set("next_inspection_date", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">תדירות בדיקה (חודשים)</label>
                <Input type="number" value={form.inspection_frequency_months || 12} onChange={e => set("inspection_frequency_months", parseInt(e.target.value))} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">בודק</label>
                <Input value={form.inspector_name || ""} onChange={e => set("inspector_name", e.target.value)} className="bg-background/50 mt-1" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">מפרט</label>
              <Input value={form.specification || ""} onChange={e => set("specification", e.target.value)} className="bg-background/50 mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">הערות</label>
              <Input value={form.notes || ""} onChange={e => set("notes", e.target.value)} className="bg-background/50 mt-1" />
            </div>
          </div>
          <div className="flex gap-2 mt-4 justify-end">
            <Button variant="outline" onClick={onClose}>ביטול</Button>
            <Button disabled={saving} onClick={async () => {
              setSaving(true); try { await onSave(form); } finally { setSaving(false); }
            }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Save className="w-4 h-4 ml-1" />}שמירה
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SECTION TABS ─────────────────────────────────────────

type TabKey = "contacts" | "evacuation" | "drills" | "equipment";

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: "contacts", label: "אנשי קשר חירום", icon: Phone },
  { key: "evacuation", label: "תכניות פינוי", icon: Building2 },
  { key: "drills", label: "תרגילים", icon: ClipboardList },
  { key: "equipment", label: "ציוד חירום", icon: Wrench },
];

// ─── MAIN COMPONENT ──────────────────────────────────────

export default function EmergencyPreparedness() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabKey>("contacts");

  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [evacPlans, setEvacPlans] = useState<EvacuationPlan[]>([]);
  const [drillSchedules, setDrillSchedules] = useState<DrillSchedule[]>([]);
  const [drillRecords, setDrillRecords] = useState<DrillRecord[]>([]);
  const [equipment, setEquipment] = useState<EmergencyEquipment[]>([]);

  const [loading, setLoading] = useState(false);
  const [editContact, setEditContact] = useState<Partial<EmergencyContact> | null>(null);
  const [editEvacPlan, setEditEvacPlan] = useState<Partial<EvacuationPlan> | null>(null);
  const [editDrill, setEditDrill] = useState<any | null>(null);
  const [isDrillRecord, setIsDrillRecord] = useState(false);
  const [editEquipment, setEditEquipment] = useState<Partial<EmergencyEquipment> | null>(null);
  const [drillsView, setDrillsView] = useState<"scheduled" | "records">("scheduled");

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [r1, r2, r3, r4, r5] = await Promise.all([
        authFetch(`${API}/hse-emergency-contacts?limit=100&is_active=true`).then(r => r.json()),
        authFetch(`${API}/hse-evacuation-plans?limit=100&is_active=true`).then(r => r.json()),
        authFetch(`${API}/hse-drill-schedules?limit=100&is_active=true`).then(r => r.json()),
        authFetch(`${API}/hse-drill-records?limit=100`).then(r => r.json()),
        authFetch(`${API}/hse-emergency-equipment?limit=200&is_active=true`).then(r => r.json()),
      ]);
      setContacts(safeArr(r1));
      setEvacPlans(safeArr(r2));
      setDrillSchedules(safeArr(r3));
      setDrillRecords(safeArr(r4));
      setEquipment(safeArr(r5));
    } catch { toast({ title: "שגיאה בטעינה", variant: "destructive" }); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const crudSave = async (endpoint: string, data: any) => {
    const url = data.id ? `${API}/${endpoint}/${data.id}` : `${API}/${endpoint}`;
    const method = data.id ? "PUT" : "POST";
    const res = await authFetch(url, { method, body: JSON.stringify(data) });
    if (!res.ok) throw new Error("שגיאה בשמירה");
    toast({ title: "נשמר בהצלחה" });
    loadAll();
  };

  const crudDelete = async (endpoint: string, id: number, name: string) => {
    if (!confirm(`האם למחוק ${name}?`)) return;
    await authFetch(`${API}/${endpoint}/${id}`, { method: "DELETE" });
    toast({ title: "נמחק" });
    loadAll();
  };

  const inspectionDue = (eq: EmergencyEquipment) => {
    if (!eq.next_inspection_date) return false;
    return new Date(eq.next_inspection_date) <= new Date(Date.now() + 30 * 86400000);
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {editContact && <ContactForm initial={editContact} onSave={d => crudSave("hse-emergency-contacts", d).then(() => setEditContact(null))} onClose={() => setEditContact(null)} />}
      {editEvacPlan && <EvacuationPlanForm initial={editEvacPlan} onSave={d => crudSave("hse-evacuation-plans", d).then(() => setEditEvacPlan(null))} onClose={() => setEditEvacPlan(null)} />}
      {editDrill && <DrillForm initial={editDrill} isDrillRecord={isDrillRecord}
        onSave={d => crudSave(isDrillRecord ? "hse-drill-records" : "hse-drill-schedules", d).then(() => setEditDrill(null))}
        onClose={() => setEditDrill(null)} />}
      {editEquipment && <EquipmentForm initial={editEquipment} onSave={d => crudSave("hse-emergency-equipment", d).then(() => setEditEquipment(null))} onClose={() => setEditEquipment(null)} />}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="w-7 h-7 text-blue-400" />
            מוכנות לחירום
          </h1>
          <p className="text-sm text-muted-foreground mt-1">אנשי קשר, תכניות פינוי, תרגילים וציוד חירום</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <Phone className="w-8 h-8 text-red-400 opacity-70" />
            <div>
              <div className="text-2xl font-bold text-foreground">{contacts.filter(c => c.is_active !== false).length}</div>
              <div className="text-xs text-muted-foreground">אנשי קשר חירום</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <Building2 className="w-8 h-8 text-blue-400 opacity-70" />
            <div>
              <div className="text-2xl font-bold text-foreground">{evacPlans.length}</div>
              <div className="text-xs text-muted-foreground">תכניות פינוי</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <ClipboardList className="w-8 h-8 text-green-400 opacity-70" />
            <div>
              <div className="text-2xl font-bold text-foreground">{drillRecords.length}</div>
              <div className="text-xs text-muted-foreground">תרגילים שבוצעו</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <Wrench className={`w-8 h-8 opacity-70 ${equipment.filter(inspectionDue).length > 0 ? "text-yellow-400" : "text-green-400"}`} />
            <div>
              <div className="text-2xl font-bold text-foreground">{equipment.filter(inspectionDue).length}</div>
              <div className="text-xs text-muted-foreground">ציוד דורש בדיקה</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-1 border-b border-border/50 mb-2">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}>
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── TAB: CONTACTS ── */}
      {activeTab === "contacts" && (
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-2">
            <div className="flex justify-between items-center">
              <CardTitle className="text-base">ספר טלפונים לחירום</CardTitle>
              <Button size="sm" onClick={() => setEditContact({ contact_type: "internal", priority: 1 })}>
                <Plus className="w-4 h-4 ml-1" />הוספה
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? <LoadingOverlay className="min-h-[100px]" /> : (
              <div className="space-y-2">
                {contacts.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Phone className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p>אין אנשי קשר חירום. לחץ "הוספה" כדי להוסיף.</p>
                  </div>
                ) : contacts.sort((a, b) => (a.priority || 99) - (b.priority || 99)).map(c => (
                  <div key={c.id} className="flex items-center gap-3 p-3 bg-background/40 rounded-lg hover:bg-background/60 transition-colors">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-primary">{c.priority || "—"}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-foreground text-sm">{c.name}</p>
                        <Badge className={CONTACT_TYPE_CONFIG[c.contact_type]?.color || "bg-gray-500/20 text-gray-300"} style={{ fontSize: "10px" }}>
                          {CONTACT_TYPE_CONFIG[c.contact_type]?.label || c.contact_type}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{c.role}{c.organization ? ` — ${c.organization}` : ""}</p>
                    </div>
                    <div className="text-left">
                      {c.phone_primary && (
                        <a href={`tel:${c.phone_primary}`} className="flex items-center gap-1 text-sm font-mono text-primary hover:text-primary/80">
                          <Phone className="w-3.5 h-3.5" />{c.phone_primary}
                        </a>
                      )}
                      {c.available_hours && <p className="text-xs text-muted-foreground">{c.available_hours}</p>}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditContact(c)}><Edit2 className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => crudDelete("hse-emergency-contacts", c.id, c.name)}><Trash2 className="w-3.5 h-3.5 text-red-400" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── TAB: EVACUATION ── */}
      {activeTab === "evacuation" && (
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-2">
            <div className="flex justify-between items-center">
              <CardTitle className="text-base">תכניות פינוי לפי בניין</CardTitle>
              <Button size="sm" onClick={() => setEditEvacPlan({ status: "active" })}>
                <Plus className="w-4 h-4 ml-1" />הוספה
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? <LoadingOverlay className="min-h-[100px]" /> : (
              <div className="space-y-3">
                {evacPlans.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p>אין תכניות פינוי. לחץ "הוספה" כדי להוסיף.</p>
                  </div>
                ) : evacPlans.map(plan => (
                  <div key={plan.id} className="bg-background/40 rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-blue-400" />
                          <h4 className="font-semibold text-foreground">{plan.building}</h4>
                          {plan.floor && <Badge variant="outline" style={{ fontSize: "10px" }}>קומה {plan.floor}</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{plan.area_description}</p>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setEditEvacPlan(plan)}><Edit2 className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => crudDelete("hse-evacuation-plans", plan.id, plan.building)}><Trash2 className="w-3.5 h-3.5 text-red-400" /></Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
                      {plan.assembly_point && (
                        <div className="bg-green-900/20 border border-green-500/20 rounded p-2">
                          <p className="text-[10px] text-green-400">נקודת כינוס</p>
                          <p className="text-xs font-medium text-foreground">{plan.assembly_point}</p>
                        </div>
                      )}
                      {plan.primary_exit && (
                        <div className="bg-background/30 rounded p-2">
                          <p className="text-[10px] text-muted-foreground">יציאת פינוי ראשית</p>
                          <p className="text-xs font-medium text-foreground">{plan.primary_exit}</p>
                        </div>
                      )}
                      {plan.warden_name && (
                        <div className="bg-background/30 rounded p-2">
                          <p className="text-[10px] text-muted-foreground">אחמ"ש פינוי</p>
                          <p className="text-xs font-medium text-foreground">{plan.warden_name}</p>
                          {plan.warden_phone && <p className="text-[10px] text-primary">{plan.warden_phone}</p>}
                        </div>
                      )}
                    </div>
                    {plan.next_review_date && (
                      <p className="text-[10px] text-muted-foreground mt-2">
                        <Calendar className="w-3 h-3 inline ml-1" />
                        בדיקה הבאה: {fmtDate(plan.next_review_date)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── TAB: DRILLS ── */}
      {activeTab === "drills" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="flex gap-1 bg-card/50 rounded-lg p-1">
              <button onClick={() => setDrillsView("scheduled")}
                className={`px-3 py-1.5 rounded text-sm transition-colors ${drillsView === "scheduled" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                לוח זמנים
              </button>
              <button onClick={() => setDrillsView("records")}
                className={`px-3 py-1.5 rounded text-sm transition-colors ${drillsView === "records" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                תרגילים שבוצעו
              </button>
            </div>
            <Button size="sm" onClick={() => {
              setIsDrillRecord(drillsView === "records");
              setEditDrill({ drill_type: "fire", status: drillsView === "records" ? "completed" : "scheduled" });
            }}>
              <Plus className="w-4 h-4 ml-1" />{drillsView === "records" ? "תיעוד תרגיל" : "תזמון תרגיל"}
            </Button>
          </div>

          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              {loading ? <LoadingOverlay className="min-h-[100px]" /> : (
                drillsView === "scheduled" ? (
                  <div className="space-y-3">
                    {drillSchedules.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p>אין תרגילים מתוכננים</p>
                      </div>
                    ) : drillSchedules.map(drill => {
                      const typeCfg = DRILL_TYPES[drill.drill_type] || DRILL_TYPES.general;
                      const Icon = typeCfg.icon;
                      const isPast = drill.scheduled_date && new Date(drill.scheduled_date) < new Date();
                      return (
                        <div key={drill.id} className="flex items-center gap-3 p-3 bg-background/40 rounded-lg">
                          <Icon className={`w-5 h-5 ${typeCfg.color} flex-shrink-0`} />
                          <div className="flex-1">
                            <p className="font-medium text-foreground text-sm">{drill.title}</p>
                            <p className="text-xs text-muted-foreground">{typeCfg.label}{drill.building ? ` — ${drill.building}` : ""}</p>
                          </div>
                          <div className="text-center">
                            <p className={`text-sm font-mono ${isPast ? "text-red-400" : "text-foreground"}`}>
                              {fmtDate(drill.scheduled_date)}
                            </p>
                            <Badge className={drill.status === "completed" ? "bg-green-500/20 text-green-300" : "bg-blue-500/20 text-blue-300"} style={{ fontSize: "10px" }}>
                              {drill.status === "completed" ? "בוצע" : "מתוכנן"}
                            </Badge>
                          </div>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => { setIsDrillRecord(false); setEditDrill(drill); }}>
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => crudDelete("hse-drill-schedules", drill.id, drill.title)}>
                              <Trash2 className="w-3.5 h-3.5 text-red-400" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {drillRecords.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p>אין תרגילים מתועדים</p>
                      </div>
                    ) : drillRecords.map(record => {
                      const typeCfg = DRILL_TYPES[record.drill_type] || DRILL_TYPES.general;
                      const Icon = typeCfg.icon;
                      const ratingCfg = RATING_CONFIG[record.overall_rating || "good"];
                      return (
                        <div key={record.id} className="bg-background/40 rounded-lg p-4">
                          <div className="flex justify-between items-start">
                            <div className="flex items-center gap-2">
                              <Icon className={`w-4 h-4 ${typeCfg.color}`} />
                              <p className="font-medium text-foreground text-sm">{record.title}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-medium ${ratingCfg?.color || "text-muted-foreground"}`}>{ratingCfg?.label}</span>
                              <Button variant="ghost" size="sm" onClick={() => { setIsDrillRecord(true); setEditDrill(record); }}>
                                <Edit2 className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => crudDelete("hse-drill-records", record.id, record.title)}>
                                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                              </Button>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-3 mt-3">
                            <div>
                              <p className="text-[10px] text-muted-foreground">תאריך</p>
                              <p className="text-xs text-foreground">{fmtDate(record.drill_date)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground">משתתפים</p>
                              <p className="text-xs text-foreground">{record.participants_count ?? "—"}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground">זמן פינוי</p>
                              <p className="text-xs text-foreground">{record.evacuation_time_seconds ? `${record.evacuation_time_seconds} שנ'` : "—"}</p>
                            </div>
                          </div>
                          {record.issues_found && (
                            <div className="mt-2 bg-red-900/20 border border-red-500/20 rounded p-2">
                              <p className="text-[10px] text-red-400">ממצאים</p>
                              <p className="text-xs">{record.issues_found}</p>
                            </div>
                          )}
                          {record.improvement_items && (
                            <div className="mt-2 bg-yellow-900/20 border border-yellow-500/20 rounded p-2">
                              <p className="text-[10px] text-yellow-400">פריטי שיפור</p>
                              <p className="text-xs">{record.improvement_items}</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── TAB: EQUIPMENT ── */}
      {activeTab === "equipment" && (
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-2">
            <div className="flex justify-between items-center">
              <CardTitle className="text-base">ציוד חירום ובטיחות</CardTitle>
              <Button size="sm" onClick={() => setEditEquipment({ equipment_type: "fire_extinguisher", status: "operational", quantity: 1, inspection_frequency_months: 12 })}>
                <Plus className="w-4 h-4 ml-1" />הוספה
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? <LoadingOverlay className="min-h-[100px]" /> : (
              <div className="overflow-x-auto">
                {equipment.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Wrench className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p>אין ציוד חירום רשום. לחץ "הוספה" כדי להוסיף.</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        {["ציוד", "מזהה", "מיקום", "בדיקה הבאה", "סטטוס", "פעולות"].map(l => (
                          <th key={l} className="text-right p-3 text-muted-foreground font-medium">{l}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {equipment.map(eq => {
                        const typeCfg = EQUIPMENT_TYPES[eq.equipment_type] || EQUIPMENT_TYPES.other;
                        const due = inspectionDue(eq);
                        return (
                          <tr key={eq.id} className={`border-b border-border/30 hover:bg-card/30 transition-colors ${due ? "bg-yellow-900/10" : ""}`}>
                            <td className="p-3">
                              <div className="flex items-center gap-1.5">
                                <span className="text-base">{typeCfg.icon}</span>
                                <div>
                                  <p className="text-sm text-foreground">{typeCfg.label}</p>
                                  {eq.description && <p className="text-xs text-muted-foreground">{eq.description}</p>}
                                </div>
                              </div>
                            </td>
                            <td className="p-3 font-mono text-xs text-muted-foreground">{eq.equipment_id_tag || "—"}</td>
                            <td className="p-3">
                              <div className="text-xs">
                                <p className="text-foreground">{eq.building || "—"}</p>
                                {eq.floor && <p className="text-muted-foreground">קומה {eq.floor}</p>}
                                {eq.location_description && <p className="text-muted-foreground">{eq.location_description}</p>}
                              </div>
                            </td>
                            <td className="p-3">
                              <span className={due ? "text-yellow-400 font-medium" : "text-foreground"}>
                                {fmtDate(eq.next_inspection_date)}
                              </span>
                              {due && <p className="text-[10px] text-yellow-400">דחוף</p>}
                            </td>
                            <td className="p-3">
                              <Badge className={EQUIPMENT_STATUS[eq.status || "operational"] || "bg-gray-500/20 text-gray-300"}>
                                {EQUIPMENT_STATUS_HE[eq.status || "operational"] || eq.status}
                              </Badge>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="sm" onClick={() => setEditEquipment(eq)}><Edit2 className="w-3.5 h-3.5" /></Button>
                                <Button variant="ghost" size="sm" onClick={() => crudDelete("hse-emergency-equipment", eq.id, typeCfg.label)}>
                                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
