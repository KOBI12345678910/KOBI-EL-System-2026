import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Building2, Mail, Lock, Loader2, Eye, EyeOff, User } from "lucide-react";

export default function CustomerPortalLogin() {
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [inviteToken, setInviteToken] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (token) {
      setInviteToken(token);
      setMode("register");
    }
    const stored = localStorage.getItem("customer_portal_token");
    if (stored) setLocation("/portal/customer/dashboard");
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const endpoint = mode === "login" ? "/api/portal/customer/login" : "/api/portal/customer/register";
      const body: any = { email, password };
      if (mode === "register") { body.fullName = fullName; body.phone = phone; if (inviteToken) body.inviteToken = inviteToken; }

      const r = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok || d.error) { setError(d.error || "שגיאה בהתחברות"); return; }

      localStorage.setItem("customer_portal_token", d.token);
      localStorage.setItem("customer_portal_user", JSON.stringify(d.user));
      setLocation("/portal/customer/dashboard");
    } catch (err: any) {
      setError("שגיאה בחיבור לשרת");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Building2 className="w-7 h-7 text-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">פורטל לקוחות</h1>
          <p className="text-blue-300/70 text-sm mt-1">Customer Self-Service Portal</p>
        </div>

        <div className="bg-card border border-white/10 rounded-2xl p-6 shadow-2xl">
          <div className="flex gap-1 mb-6 bg-muted/30 rounded-lg p-1">
            <button
              onClick={() => setMode("login")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === "login" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              כניסה
            </button>
            <button
              onClick={() => setMode("register")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === "register" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              הרשמה
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <div>
                <label className="text-sm text-muted-foreground block mb-1">שם מלא</label>
                <div className="relative">
                  <User className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    className="input input-bordered w-full pr-9"
                    placeholder="שם מלא"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    required
                  />
                </div>
              </div>
            )}

            <div>
              <label className="text-sm text-muted-foreground block mb-1">אימייל</label>
              <div className="relative">
                <Mail className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                <input
                  type="email"
                  className="input input-bordered w-full pr-9"
                  placeholder="your@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  dir="ltr"
                  required
                />
              </div>
            </div>

            {mode === "register" && (
              <div>
                <label className="text-sm text-muted-foreground block mb-1">טלפון</label>
                <input
                  type="tel"
                  className="input input-bordered w-full"
                  placeholder="050-0000000"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                />
              </div>
            )}

            <div>
              <label className="text-sm text-muted-foreground block mb-1">סיסמה</label>
              <div className="relative">
                <Lock className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                <input
                  type={showPass ? "text" : "password"}
                  className="input input-bordered w-full pr-9 pl-9"
                  placeholder="סיסמה"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  dir="ltr"
                  required
                  minLength={6}
                />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute left-3 top-2.5 text-muted-foreground hover:text-foreground">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg p-3">{error}</div>
            )}

            <button type="submit" disabled={loading} className="btn btn-primary w-full">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === "login" ? "כניסה לפורטל" : "הרשמה"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-blue-300/40 mt-6">© {new Date().getFullYear()} Customer Portal — Powered by ERP System</p>
      </div>
    </div>
  );
}
