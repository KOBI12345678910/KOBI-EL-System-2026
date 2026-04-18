import { useLocation } from "wouter";
import { ShieldOff, Home, ArrowRight } from "lucide-react";

export default function ForbiddenPage() {
  const [, navigate] = useLocation();
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6 p-8 text-center" dir="rtl">
      <div className="w-20 h-20 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
        <ShieldOff className="w-10 h-10 text-red-500" />
      </div>
      <div className="space-y-2">
        <h1 className="text-4xl font-bold text-foreground">403</h1>
        <h2 className="text-xl font-semibold text-foreground">אין הרשאה</h2>
        <p className="text-muted-foreground max-w-sm">
          אין לך הרשאה לגשת לדף זה. פנה למנהל המערכת לקבלת גישה מתאימה.
        </p>
      </div>
      <div className="flex gap-3">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium transition-colors"
        >
          <Home size={16} />
          לדף הבית
        </button>
        <button
          onClick={() => window.history.back()}
          className="flex items-center gap-2 px-5 py-2.5 border border-border rounded-lg hover:bg-muted text-sm font-medium transition-colors"
        >
          <ArrowRight size={16} />
          חזור אחורה
        </button>
      </div>
    </div>
  );
}
