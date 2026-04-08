import { useState } from "react";
import { useLocation } from "wouter";
import { authFetch } from "@/lib/utils";

export default function PortalLoginPage() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [inviteToken, setInviteToken] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [inviteInfo, setInviteInfo] = useState<{ email: string; userType: string } | null>(null);

  async function validateInvite() {
    if (!inviteToken.trim()) { setError("הזן קוד הזמנה"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await authFetch(`/api/portal/invite/validate/${inviteToken}`);
      const data = await res.json();
      if (data.valid) {
        setInviteInfo({ email: data.email, userType: data.userType });
        setEmail(data.email);
      } else {
        setError(data.error || "הזמנה לא תקינה");
      }
    } catch {
      setError("שגיאת תקשורת");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim() || !password.trim()) { setError("מלא את כל השדות"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/portal/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteToken, password, fullName, phone }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setMode("login");
      setError("");
      alert("נרשמת בהצלחה! התחבר עם האימייל והסיסמה שלך");
    } catch {
      setError("שגיאת תקשורת");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) { setError("מלא את כל השדות"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/portal/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      localStorage.setItem("portal_token", data.token);
      localStorage.setItem("portal_user", JSON.stringify(data.user));
      const userType = data.user.userType;
      if (userType === "supplier") setLocation("/portal/supplier");
      else if (userType === "contractor") setLocation("/portal/contractor");
      else if (userType === "employee") setLocation("/portal/employee");
      else setLocation("/portal/supplier");
    } catch {
      setError("שגיאת תקשורת");
    } finally {
      setLoading(false);
    }
  }

  const userTypeLabels: Record<string, string> = {
    supplier: "ספק",
    contractor: "קבלן",
    employee: "עובד",
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600/20 border border-blue-500/30 mb-4">
            <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
            </svg>
          </div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground">פורטל חיצוני</h1>
          <p className="text-muted-foreground mt-1">גישה לספקים, קבלנים ועובדים</p>
        </div>

        <div className="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-2xl p-6 shadow-xl">
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => { setMode("login"); setError(""); }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${mode === "login" ? "bg-blue-600 text-foreground" : "bg-slate-700/50 text-muted-foreground hover:text-foreground"}`}
            >
              התחברות
            </button>
            <button
              onClick={() => { setMode("register"); setError(""); }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${mode === "register" ? "bg-blue-600 text-foreground" : "bg-slate-700/50 text-muted-foreground hover:text-foreground"}`}
            >
              הרשמה
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          {mode === "login" ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">אימייל</label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-foreground placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="your@email.com" autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">סיסמה</label>
                <input
                  type="password" value={password} onChange={e => setPassword(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-foreground placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="••••••••"
                />
              </div>
              <button
                type="submit" disabled={loading}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-foreground rounded-lg font-medium transition disabled:opacity-50"
              >
                {loading ? "מתחבר..." : "התחבר"}
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              {!inviteInfo ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">קוד הזמנה</label>
                    <input
                      type="text" value={inviteToken} onChange={e => setInviteToken(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-foreground placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      placeholder="הזן את קוד ההזמנה שקיבלת" autoFocus
                    />
                  </div>
                  <button
                    onClick={validateInvite} disabled={loading}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-foreground rounded-lg font-medium transition disabled:opacity-50"
                  >
                    {loading ? "בודק..." : "אמת הזמנה"}
                  </button>
                </>
              ) : (
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-sm">
                    הזמנה תקינה · {inviteInfo.email} · {userTypeLabels[inviteInfo.userType] || inviteInfo.userType}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">שם מלא</label>
                    <input
                      type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-foreground placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">טלפון</label>
                    <input
                      type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-foreground placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">סיסמה</label>
                    <input
                      type="password" value={password} onChange={e => setPassword(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-foreground placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      placeholder="לפחות 6 תווים"
                    />
                  </div>
                  <button
                    type="submit" disabled={loading}
                    className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-foreground rounded-lg font-medium transition disabled:opacity-50"
                  >
                    {loading ? "נרשם..." : "הירשם"}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        <p className="text-center text-muted-foreground text-sm mt-4">
          <button onClick={() => setLocation("/")} className="text-blue-400 hover:text-blue-300">
            חזרה למערכת ERP
          </button>
        </p>
      </div>
    </div>
  );
}
