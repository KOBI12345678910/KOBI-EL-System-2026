import { useState, useEffect } from "react";
import { KeyRound, ArrowRight, CheckCircle2, AlertCircle, Eye, EyeOff, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { authFetch } from "@/lib/utils";

const API_BASE = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

interface ResetPasswordPageProps {
  token?: string;
}

export default function ResetPasswordPage({ token }: ResetPasswordPageProps) {
  const [, navigate] = useLocation();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [tokenError, setTokenError] = useState("");

  const resolvedToken = token || new URLSearchParams(window.location.search).get("token") || "";

  useEffect(() => {
    if (!resolvedToken) {
      setTokenValid(false);
      setTokenError("לינק לאיפוס לא תקין. בקש לינק חדש מדף שחזור הסיסמה.");
      return;
    }
    (async () => {
      try {
        const res = await authFetch(`${API_BASE}/auth/reset-password/${resolvedToken}`);
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.valid) {
          setTokenValid(true);
        } else {
          setTokenValid(false);
          setTokenError(data.error || "הלינק לאיפוס סיסמה אינו תקף");
        }
      } catch {
        setTokenValid(false);
        setTokenError("שגיאת תקשורת עם השרת");
      }
    })();
  }, [resolvedToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) { setError("נא להזין סיסמה חדשה"); return; }
    if (password.length < 6) { setError("הסיסמה חייבת להכיל לפחות 6 תווים"); return; }
    if (password !== confirm) { setError("הסיסמאות אינן תואמות"); return; }
    if (!resolvedToken) { setError("לינק לא תקין — בקש לינק חדש מדף שחזור הסיסמה"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await authFetch(`${API_BASE}/auth/reset-password/${resolvedToken}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSuccess(true);
      } else {
        setError(data.error || "שגיאה באיפוס הסיסמה. ייתכן שהלינק פג תוקף.");
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
          <h1 className="text-2xl font-bold text-foreground">איפוס סיסמה</h1>
          <p className="text-muted-foreground text-sm">הזן את הסיסמה החדשה שלך</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 shadow-xl space-y-4">
          {tokenValid === null ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="mr-2 text-sm text-muted-foreground">מאמת לינק...</span>
            </div>
          ) : tokenValid === false ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <AlertCircle size={16} className="text-destructive mt-0.5 flex-shrink-0" />
                <span className="text-sm text-destructive">{tokenError}</span>
              </div>
              <button
                onClick={() => { window.location.href = import.meta.env.BASE_URL.replace(/\/$/, "") + "/forgot-password"; }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium transition-colors"
              >
                <KeyRound size={16} />
                בקש לינק חדש
              </button>
            </div>
          ) : success ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
                <CheckCircle2 className="text-green-500 mt-0.5 flex-shrink-0" size={18} />
                <span className="text-sm text-green-400">הסיסמה שונתה בהצלחה! כעת תוכל להתחבר עם הסיסמה החדשה.</span>
              </div>
              <button
                onClick={() => navigate("/")}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium transition-colors"
              >
                <ArrowRight size={16} />
                לדף ההתחברות
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
                <label className="text-sm font-medium text-foreground">סיסמה חדשה</label>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="לפחות 6 תווים"
                    className="w-full pr-4 pl-9 py-2.5 bg-background border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-all"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">אימות סיסמה</label>
                <input
                  type={showPw ? "text" : "password"}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="הזן שוב את הסיסמה"
                  className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-all"
                />
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
                אפס סיסמה
              </button>
              <button
                type="button"
                onClick={() => window.history.back()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-border rounded-lg hover:bg-muted text-sm text-muted-foreground transition-colors"
              >
                <ArrowRight size={16} />
                חזור
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
