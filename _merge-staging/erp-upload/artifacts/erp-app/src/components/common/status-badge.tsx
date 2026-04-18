import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusConfigs: Record<string, { label: string; color: string }> = {
  new: { label: "חדש", color: "bg-blue-100 text-blue-700 border-blue-200" },
  contacted: { label: "נוצר קשר", color: "bg-cyan-100 text-cyan-700 border-cyan-200" },
  qualified: { label: "מוסמך", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  proposal: { label: "הצעה", color: "bg-orange-100 text-orange-700 border-orange-200" },
  negotiation: { label: "משא ומתן", color: "bg-purple-100 text-purple-700 border-purple-200" },
  won: { label: "זכייה", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  lost: { label: "הפסד", color: "bg-red-100 text-red-700 border-red-200" },
  active: { label: "פעיל", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  inactive: { label: "לא פעיל", color: "bg-slate-100 text-slate-700 border-slate-200" },
  vip: { label: "VIP", color: "bg-amber-100 text-amber-700 border-amber-200" },
  draft: { label: "טיוטה", color: "bg-slate-100 text-slate-700 border-slate-200" },
  sent: { label: "נשלח", color: "bg-blue-100 text-blue-700 border-blue-200" },
  accepted: { label: "התקבל", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  rejected: { label: "נדחה", color: "bg-red-100 text-red-700 border-red-200" },
  expired: { label: "פג תוקף", color: "bg-slate-100 text-slate-600 border-slate-200" },
  revised: { label: "עודכן", color: "bg-purple-100 text-purple-700 border-purple-200" },
  pending: { label: "ממתין", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  confirmed: { label: "אושר", color: "bg-blue-100 text-blue-700 border-blue-200" },
  in_production: { label: "בייצור", color: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  ready: { label: "מוכן", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  delivered: { label: "נמסר", color: "bg-teal-100 text-teal-700 border-teal-200" },
  installed: { label: "הותקן", color: "bg-green-100 text-green-700 border-green-200" },
  completed: { label: "הושלם", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  cancelled: { label: "בוטל", color: "bg-red-100 text-red-700 border-red-200" },
  materials_reserved: { label: "חומרים שוריינו", color: "bg-cyan-100 text-cyan-700 border-cyan-200" },
  in_progress: { label: "בתהליך", color: "bg-blue-100 text-blue-700 border-blue-200" },
  qc: { label: "בבקרת איכות", color: "bg-purple-100 text-purple-700 border-purple-200" },
  measurement: { label: "מדידה", color: "bg-slate-100 text-slate-700" },
  engineering: { label: "הנדסה", color: "bg-blue-100 text-blue-700" },
  cutting: { label: "חיתוך", color: "bg-orange-100 text-orange-700" },
  welding: { label: "ריתוך", color: "bg-red-100 text-red-700" },
  grinding: { label: "ליטוש", color: "bg-yellow-100 text-yellow-700" },
  painting: { label: "צביעה", color: "bg-pink-100 text-pink-700" },
  galvanizing: { label: "גלוון", color: "bg-cyan-100 text-cyan-700" },
  packaging: { label: "אריזה", color: "bg-purple-100 text-purple-700" },
  paid: { label: "שולם", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  partial: { label: "חלקי", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  overdue: { label: "באיחור", color: "bg-red-100 text-red-700 border-red-200" },
  unpaid: { label: "לא שולם", color: "bg-red-100 text-red-700 border-red-200" },
  deposit: { label: "מקדמה", color: "bg-cyan-100 text-cyan-700 border-cyan-200" },
  partial_received: { label: "התקבל חלקית", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  received: { label: "התקבל", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  todo: { label: "לביצוע", color: "bg-slate-100 text-slate-700 border-slate-200" },
  review: { label: "בבדיקה", color: "bg-purple-100 text-purple-700 border-purple-200" },
  done: { label: "בוצע", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  scheduled: { label: "מתוזמן", color: "bg-blue-100 text-blue-700 border-blue-200" },
  issues: { label: "תקלות", color: "bg-red-100 text-red-700 border-red-200" },
  approved: { label: "אושר", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  on_leave: { label: "בחופשה", color: "bg-orange-100 text-orange-700 border-orange-200" },
  low: { label: "נמוכה", color: "bg-slate-100 text-slate-600" },
  normal: { label: "רגילה", color: "bg-blue-100 text-blue-700" },
  medium: { label: "בינונית", color: "bg-blue-100 text-blue-700" },
  high: { label: "גבוהה", color: "bg-orange-100 text-orange-700" },
  urgent: { label: "דחוף", color: "bg-red-100 text-red-700" },
  preferred: { label: "מועדף", color: "bg-amber-100 text-amber-700 border-amber-200" },
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export default function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfigs[status] || { label: status, color: "bg-slate-100 text-slate-700" };
  return (
    <Badge variant="outline" className={cn("font-medium border", config.color, className)}>
      {config.label}
    </Badge>
  );
}
