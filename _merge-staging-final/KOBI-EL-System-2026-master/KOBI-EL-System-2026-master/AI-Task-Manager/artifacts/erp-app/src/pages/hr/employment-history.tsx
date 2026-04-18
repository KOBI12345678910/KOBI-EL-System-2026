import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Clock, Plus, Trash2, Briefcase, DollarSign, Building2,
  ArrowRight, TrendingUp, UserCheck, Save, X
} from "lucide-react";
import { authJson, authFetch } from "@/lib/utils";

const API = "/api";

const EVENT_TYPE_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  hire: { label: "קליטה לעבודה", color: "text-green-400", icon: UserCheck },
  promotion: { label: "קידום", color: "text-purple-400", icon: TrendingUp },
  demotion: { label: "הורדה בדרגה", color: "text-red-400", icon: TrendingUp },
  salary_increase: { label: "העלאת שכר", color: "text-green-400", icon: DollarSign },
  salary_decrease: { label: "הפחתת שכר", color: "text-red-400", icon: DollarSign },
  department_transfer: { label: "העברת מחלקה", color: "text-blue-400", icon: Building2 },
  role_change: { label: "שינוי תפקיד", color: "text-cyan-400", icon: Briefcase },
  manager_change: { label: "שינוי מנהל", color: "text-yellow-400", icon: UserCheck },
  status_change: { label: "שינוי סטטוס", color: "text-orange-400", icon: UserCheck },
  contract_change: { label: "שינוי חוזה", color: "text-indigo-400", icon: Briefcase },
  leave_start: { label: "תחילת חופשה", color: "text-amber-400", icon: Clock },
  leave_end: { label: "חזרה מחופשה", color: "text-emerald-400", icon: Clock },
  termination: { label: "סיום העסקה", color: "text-red-400", icon: UserCheck },
  other: { label: "אחר", color: "text-muted-foreground", icon: Clock },
};

interface HistoryEvent {
  id: number;
  employee_id: number;
  employee_name: string;
  event_type: string;
  from_value: string;
  to_value: string;
  effective_date: string;
  approved_by: string;
  notes: string;
  created_at: string;
}

interface Props {
  employeeId: number;
  employeeName?: string;
  readOnly?: boolean;
}

export default function EmploymentHistory({ employeeId, employeeName, readOnly }: Props) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>({ eventType: "role_change", effectiveDate: new Date().toISOString().slice(0, 10) });

  const { data: events = [], isLoading } = useQuery<HistoryEvent[]>({
    queryKey: ["employment-history", employeeId],
    queryFn: () => authJson(`${API}/employment-history?employee_id=${employeeId}`),
    enabled: !!employeeId,
  });

  const addMutation = useMutation({
    mutationFn: (data: any) => authFetch(`${API}/employment-history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employment-history", employeeId] });
      setShowForm(false);
      setForm({ eventType: "role_change", effectiveDate: new Date().toISOString().slice(0, 10) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => authFetch(`${API}/employment-history/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["employment-history", employeeId] }),
  });

  const handleSave = () => {
    if (!form.eventType || !form.effectiveDate) return;
    addMutation.mutate({
      employeeId,
      employeeName,
      eventType: form.eventType,
      fromValue: form.fromValue || null,
      toValue: form.toValue || null,
      effectiveDate: form.effectiveDate,
      approvedBy: form.approvedBy || null,
      notes: form.notes || null,
    });
  };

  if (isLoading) return (
    <div className="flex items-center justify-center py-8">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
    </div>
  );

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary" />
          היסטוריית העסקה
          <span className="text-xs font-normal text-muted-foreground">({events.length} אירועים)</span>
        </h3>
        {!readOnly && (
          <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/20 text-primary rounded-lg text-xs font-medium hover:bg-primary/30 transition-colors">
            <Plus className="w-3.5 h-3.5" />
            הוסף אירוע
          </button>
        )}
      </div>

      {events.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Clock className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">אין היסטוריית העסקה</p>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute right-[19px] top-0 bottom-0 w-px bg-border/50" />
          <div className="space-y-4">
            {events.map(event => {
              const cfg = EVENT_TYPE_CONFIG[event.event_type] || EVENT_TYPE_CONFIG.other;
              const Icon = cfg.icon;
              return (
                <div key={event.id} className="flex gap-4 relative">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 z-10 bg-card border border-border/50`}>
                    <Icon className={`w-4 h-4 ${cfg.color}`} />
                  </div>
                  <div className="flex-1 pb-4 border-b border-border/20 last:border-0">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className={`text-sm font-medium ${cfg.color}`}>{cfg.label}</span>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {event.effective_date?.slice(0, 10)}
                          {event.approved_by && ` • אושר על ידי: ${event.approved_by}`}
                        </p>
                      </div>
                      {!readOnly && (
                        <button onClick={() => deleteMutation.mutate(event.id)} className="p-1 hover:bg-muted rounded-lg shrink-0">
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      )}
                    </div>

                    {(event.from_value || event.to_value) && (
                      <div className="flex items-center gap-2 mt-1.5 text-xs">
                        {event.from_value && <span className="text-muted-foreground bg-muted/20 px-2 py-0.5 rounded">{event.from_value}</span>}
                        {event.from_value && event.to_value && <ArrowRight className="w-3 h-3 text-muted-foreground rotate-180" />}
                        {event.to_value && <span className="text-foreground bg-primary/10 px-2 py-0.5 rounded">{event.to_value}</span>}
                      </div>
                    )}

                    {event.notes && (
                      <p className="text-xs text-muted-foreground mt-1 italic">{event.notes}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h2 className="text-base font-bold text-foreground">הוספת אירוע היסטוריה</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-muted rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">סוג אירוע *</label>
                <select value={form.eventType || ""} onChange={e => setForm((f: any) => ({ ...f, eventType: e.target.value }))}
                  className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm">
                  {Object.entries(EVENT_TYPE_CONFIG).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">תאריך יעיל *</label>
                <input type="date" value={form.effectiveDate || ""} onChange={e => setForm((f: any) => ({ ...f, effectiveDate: e.target.value }))}
                  className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">מ-</label>
                  <input value={form.fromValue || ""} onChange={e => setForm((f: any) => ({ ...f, fromValue: e.target.value }))}
                    placeholder="ערך קודם"
                    className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">ל-</label>
                  <input value={form.toValue || ""} onChange={e => setForm((f: any) => ({ ...f, toValue: e.target.value }))}
                    placeholder="ערך חדש"
                    className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">אושר על ידי</label>
                <input value={form.approvedBy || ""} onChange={e => setForm((f: any) => ({ ...f, approvedBy: e.target.value }))}
                  className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">הערות</label>
                <textarea value={form.notes || ""} onChange={e => setForm((f: any) => ({ ...f, notes: e.target.value }))}
                  rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm resize-none" />
              </div>
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">ביטול</button>
              <button onClick={handleSave} disabled={addMutation.isPending}
                className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
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
