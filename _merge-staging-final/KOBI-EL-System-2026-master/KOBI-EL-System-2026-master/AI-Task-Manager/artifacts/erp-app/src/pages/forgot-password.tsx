import { useState } from "react";
import { KeyRound, ArrowRight, CheckCircle2, AlertCircle, Mail } from "lucide-react";
import { authFetch } from "@/lib/utils";

const API_BASE = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

interface ForgotPasswordPageProps {
  onBack?: () => void;
}

export default function ForgotPasswordPage({ onBack }: ForgotPasswordPageProps) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError("נא להזין כתובת מייל"); return; }
    setLoading(true);
    setError("");
    setSuccessMsg("");
    try {
      const res = await authFetch(`${API_BASE}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok || data.message) {
        setSuccessMsg("אם הפרטים קיימים במערכת, סיסמה חדשה נוצרה. פנה למנהל המערכת לקבלתה, או בדוק את תיבת המייל שלך.");
      } else {
        setError(data.error || "שגיאה בשליחת הבקשה, נסה שוב");
      }
    } catch {
      setError("שגיאת תקשורת עם השרת");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
            <KeyRound className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">שחזור סיסמה</h1>
          <p className="text-muted-foreground text-sm">הזן את כתובת המייל שלך ואנו נשלח הוראות לאיפוס הסיסמה</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 shadow-xl space-y-4">
          {successMsg ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
                <CheckCircle2 className="text-green-500 mt-0.5 flex-shrink-0" size={18} />
                <pre className="text-sm text-green-400 whitespace-pre-wrap">{successMsg}</pre>
              </div>
              <button
                onClick={onBack ?? (() => window.history.back())}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium transition-colors"
              >
                <ArrowRight size={16} />
                חזור להתחברות
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <AlertCircle size={16} className="text-destructive mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-destructive">{error}</span>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">כתובת מייל</label>
                <div className="relative">
                  <Mail size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full pr-9 pl-4 py-2.5 bg-background border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-all"
                    autoFocus
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 text-sm font-medium transition-colors"
              >
                {loading ? (
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                ) : <KeyRound size={16} />}
                שלח הוראות איפוס
              </button>
              <button
                type="button"
                onClick={onBack ?? (() => window.history.back())}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-border rounded-lg hover:bg-muted text-sm text-muted-foreground transition-colors"
              >
                <ArrowRight size={16} />
                חזור להתחברות
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
