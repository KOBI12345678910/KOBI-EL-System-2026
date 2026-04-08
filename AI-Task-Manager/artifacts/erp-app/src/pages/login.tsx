import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Shield, LogIn, Factory, AlertCircle, KeyRound, ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { authFetch } from "@/lib/utils";
const API_BASE = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

interface LoginPageProps {
  onLogin: (token: string, user: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: any) => void;
          renderButton: (el: HTMLElement, config: any) => void;
        };
      };
    };
  }
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [mode, setMode] = useState<"login" | "forgot" | "mfa">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [forgotEmail, setForgotEmail] = useState("");
  const [recoveredPassword, setRecoveredPassword] = useState("");
  const [mfaTempToken, setMfaTempToken] = useState("");
  const [mfaMethod, setMfaMethod] = useState<string>("totp");
  const [mfaCode, setMfaCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const mfaInputRef = useRef<HTMLInputElement>(null);

  const handleGoogleResponse = useCallback(async (response: any) => {
    setError("");
    setLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: response.credential }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "שגיאת התחברות Google"); return; }
      onLogin(data.token, data.user);
    } catch {
      setError("שגיאת תקשורת עם השרת");
    } finally {
      setLoading(false);
    }
  }, [onLogin]);

  useEffect(() => {
    authFetch(`${API_BASE}/auth/google/client-id`)
      .then(r => r.json())
      .then(data => {
        if (data.clientId) {
          setGoogleClientId(data.clientId);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!googleClientId || mode !== "login") return;

    const existingScript = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existingScript) {
      initializeGoogle();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => initializeGoogle();
    document.head.appendChild(script);

    function initializeGoogle() {
      setTimeout(() => {
        if (window.google) {
          window.google.accounts.id.initialize({
            client_id: googleClientId,
            callback: handleGoogleResponse,
          });
          const btnEl = document.getElementById("google-signin-btn");
          if (btnEl) {
            window.google.accounts.id.renderButton(btnEl, {
              theme: "filled_black",
              size: "large",
              width: "100%",
              text: "signin_with",
              locale: "he",
            });
          }
        }
      }, 200);
    }
  }, [googleClientId, handleGoogleResponse, mode]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginForm),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "שגיאת התחברות"); return; }
      if (data.mfa_required) {
        setMfaTempToken(data.temp_token);
        setMfaMethod(data.method || "totp");
        setMfaCode("");
        setUseBackupCode(false);
        setError("");
        setMode("mfa");
        setTimeout(() => mfaInputRef.current?.focus(), 100);
        return;
      }
      localStorage.setItem("erp_username", loginForm.username);
      onLogin(data.token, data.user);
    } catch {
      setError("שגיאת תקשורת עם השרת");
    } finally {
      setLoading(false);
    }
  }

  async function handleMfaVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaCode.trim()) {
      setError("יש להזין קוד אימות");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/auth/mfa-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ temp_token: mfaTempToken, code: mfaCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "קוד אימות שגוי"); return; }
      localStorage.setItem("erp_username", loginForm.username);
      onLogin(data.token, data.user);
    } catch {
      setError("שגיאת תקשורת עם השרת");
    } finally {
      setLoading(false);
    }
  }

  function handleBackToLogin() {
    setMode("login");
    setMfaTempToken("");
    setMfaCode("");
    setUseBackupCode(false);
    setError("");
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    setRecoveredPassword("");
    const trimmedInput = forgotEmail.trim();
    if (!trimmedInput) {
      setError("יש להזין שם משתמש או כתובת אימייל");
      return;
    }
    setLoading(true);
    const isEmail = trimmedInput.includes("@");
    const payload = isEmail ? { email: trimmedInput } : { username: trimmedInput };
    try {
      const res = await authFetch(`${API_BASE}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "שגיאה באיפוס הסיסמה"); return; }
      setSuccessMsg(data.message || "הסיסמה אופסה בהצלחה");
      if (data.newPassword) {
        setRecoveredPassword(data.newPassword);
      }
    } catch {
      setError("שגיאת תקשורת עם השרת");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600/20 border border-blue-500/30 mb-4">
            <Factory className="w-8 h-8 text-blue-400" />
          </div>
          <h1 className="text-xl sm:text-3xl font-bold text-foreground">טכנו-כל עוזי</h1>
          <p className="text-blue-300/70 mt-1">TECHNO-KOL UZI 2026</p>
          <p className="text-muted-foreground text-sm mt-2">מערכת ניהול מפעל מתכת/ברזל/אלומיניום/זכוכית</p>
        </div>

        <Card className="bg-slate-900/80 border-slate-700/50 backdrop-blur-xl">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2 justify-center text-foreground">
              {mode === "login" ? <LogIn className="w-5 h-5 text-blue-400" /> : mode === "mfa" ? <ShieldCheck className="w-5 h-5 text-green-400" /> : <KeyRound className="w-5 h-5 text-amber-400" />}
              <span className="font-semibold text-lg">{mode === "login" ? "התחברות למערכת" : mode === "mfa" ? "אימות דו-שלבי" : "שחזור סיסמה"}</span>
            </div>
          </CardHeader>

          <CardContent>
            
            {error && (
              <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}
            {successMsg && (
              <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-sm">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="whitespace-pre-line" dir="auto">{successMsg}</span>
              </div>
            )}

            {mode === "login" ? (
              <>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <Label htmlFor="login-user" className="text-slate-300">שם משתמש</Label>
                    <Input id="login-user" value={loginForm.username}
                      onChange={(e) => setLoginForm(p => ({ ...p, username: e.target.value }))}
                      className="bg-slate-800/50 border-slate-600 text-foreground mt-1" placeholder="הכנס שם משתמש" required autoFocus
                      autoComplete="username" />
                  </div>
                  <div>
                    <Label htmlFor="login-pass" className="text-slate-300">סיסמה</Label>
                    <Input id="login-pass" type="password" value={loginForm.password}
                      onChange={(e) => setLoginForm(p => ({ ...p, password: e.target.value }))}
                      className="bg-slate-800/50 border-slate-600 text-foreground mt-1" placeholder="הכנס סיסמה" required
                      autoComplete="current-password" />
                  </div>
                  <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={loading}>
                    {loading ? "מתחבר..." : "התחבר"}
                  </Button>
                </form>

                {googleClientId && (
                  <>
                    <div className="relative my-4">
                      <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-700" /></div>
                      <div className="relative flex justify-center text-xs"><span className="bg-slate-900 px-2 text-muted-foreground">או</span></div>
                    </div>
                    <div id="google-signin-btn" className="flex justify-center" />
                  </>
                )}

                <p className="text-muted-foreground text-sm text-center mt-4">
                  <button type="button" onClick={() => { setMode("forgot"); setError(""); setSuccessMsg(""); }} className="text-amber-400 hover:text-amber-300 font-medium underline underline-offset-2">
                    שכחתי סיסמה
                  </button>
                </p>
              </>
            ) : mode === "mfa" ? (
              <>
                <div className="text-center mb-4">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-600/20 border border-green-500/30 mb-3">
                    <ShieldCheck className="w-6 h-6 text-green-400" />
                  </div>
                  <p className="text-slate-300 text-sm">
                    {useBackupCode ? "הזן קוד גיבוי שקיבלת בהפעלת האימות הדו-שלבי" : mfaMethod === "totp" ? "הזן את הקוד מאפליקציית האימות שלך" : mfaMethod === "sms" ? "הזן את הקוד שנשלח אליך ב-SMS לטלפון" : "הזן את הקוד שנשלח אליך באימייל"}
                  </p>
                </div>
                <form onSubmit={handleMfaVerify} className="space-y-4">
                  <div>
                    <Label htmlFor="mfa-code" className="text-slate-300">
                      {useBackupCode ? "קוד גיבוי" : "קוד אימות (6 ספרות)"}
                    </Label>
                    <Input
                      ref={mfaInputRef}
                      id="mfa-code"
                      type="text"
                      inputMode={useBackupCode ? "text" : "numeric"}
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value.replace(useBackupCode ? /[^a-zA-Z0-9]/g : /\D/g, ""))}
                      maxLength={useBackupCode ? 16 : 6}
                      className="bg-slate-800/50 border-slate-600 text-foreground mt-1 text-center text-2xl tracking-[0.5em] font-mono"
                      dir="ltr"
                      placeholder={useBackupCode ? "קוד גיבוי" : "000000"}
                      required
                      autoFocus
                      autoComplete="one-time-code"
                    />
                  </div>
                  <Button type="submit" className="w-full bg-green-600 hover:bg-green-700" disabled={loading || (!useBackupCode && mfaCode.length < 6)}>
                    {loading ? "מאמת..." : "אמת כניסה"}
                  </Button>
                </form>

                <div className="flex flex-col items-center gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => { setUseBackupCode(!useBackupCode); setMfaCode(""); setError(""); }}
                    className="text-amber-400 hover:text-amber-300 text-sm font-medium underline underline-offset-2"
                  >
                    {useBackupCode ? (mfaMethod === "totp" ? "חזרה לקוד מאפליקציית האימות" : mfaMethod === "sms" ? "חזרה לקוד SMS" : "חזרה לקוד מהאימייל") : "השתמש בקוד גיבוי"}
                  </button>
                  <button
                    type="button"
                    onClick={handleBackToLogin}
                    className="text-blue-400 hover:text-blue-300 text-sm font-medium underline underline-offset-2 flex items-center gap-1"
                  >
                    <ArrowRight className="w-3 h-3" />
                    חזרה להתחברות
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-muted-foreground text-sm mb-4 text-center">
                  הזן שם משתמש או כתובת אימייל לשחזור סיסמה
                </p>
                {recoveredPassword ? (
                  <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/40 text-center space-y-2">
                    <p className="text-amber-300 text-sm font-medium">שליחת האימייל לא הצליחה. הסיסמה החדשה שלך היא:</p>
                    <p className="text-foreground text-xl font-mono tracking-widest select-all bg-slate-800 rounded px-3 py-2 border border-slate-600" dir="ltr">{recoveredPassword}</p>
                    <p className="text-muted-foreground text-xs">העתק את הסיסמה ושמור אותה, לאחר מכן התחבר עם הסיסמה הזו</p>
                  </div>
                ) : (
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <div>
                      <Label htmlFor="forgot-email" className="text-slate-300">שם משתמש או אימייל</Label>
                      <Input id="forgot-email" type="text" value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        className="bg-slate-800/50 border-slate-600 text-foreground mt-1" placeholder="שם משתמש או כתובת אימייל" dir="rtl" required autoFocus />
                    </div>
                    <Button type="submit" className="w-full bg-amber-600 hover:bg-amber-700" disabled={loading}>
                      {loading ? "שולח..." : "שלח קישור לאיפוס סיסמה"}
                    </Button>
                  </form>
                )}

                <p className="text-muted-foreground text-sm text-center mt-4">
                  <button type="button" onClick={() => { setMode("login"); setError(""); setSuccessMsg(""); setForgotEmail(""); setRecoveredPassword(""); }} className="text-blue-400 hover:text-blue-300 font-medium underline underline-offset-2 flex items-center gap-1 mx-auto">
                    <ArrowRight className="w-3 h-3" />
                    חזרה להתחברות
                  </button>
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <div className="text-center mt-4 flex items-center justify-center gap-2 text-muted-foreground text-xs">
          <Shield className="w-3 h-3" />
          <span>מוגן בהצפנה | PBKDF2-SHA512{googleClientId ? " | Google OAuth" : ""}</span>
        </div>
      </div>
    </div>
  );
}
