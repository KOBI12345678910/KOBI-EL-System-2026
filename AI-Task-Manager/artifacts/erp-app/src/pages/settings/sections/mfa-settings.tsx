import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Shield, ShieldCheck, ShieldX, QrCode, Key, Mail, Smartphone,
  AlertCircle, CheckCircle, Copy, Eye, EyeOff, Loader2, RefreshCw,
  Info, X
} from "lucide-react";

interface MfaStatus {
  isEnabled: boolean;
  method: string | null;
  totpVerified: boolean;
  emailVerified: boolean;
  lastUsedAt: string | null;
  backupCodesCount: number;
  isRequired: boolean;
}

interface TotpSetup {
  secret: string;
  uri: string;
  qrData: string;
}

interface RoleMfaRequirement {
  id: number;
  roleId: number;
  requireMfa: boolean;
  requireMfaForActions: string[];
}

const SENSITIVE_ACTIONS = [
  { key: "delete_records", label: "מחיקת רשומות" },
  { key: "change_permissions", label: "שינוי הרשאות" },
  { key: "financial_approvals", label: "אישורים פיננסיים" },
  { key: "export_data", label: "ייצוא נתונים" },
  { key: "manage_users", label: "ניהול משתמשים" },
];

function QRCodeDisplay({ uri }: { uri: string }) {
  const [showSecret, setShowSecret] = useState(false);
  const secret = uri.split("secret=")[1]?.split("&")[0] || "";
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(uri)}`;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="bg-white p-3 rounded-xl">
        <img src={qrApiUrl} alt="QR Code" className="w-48 h-48" />
      </div>
      <div className="text-center">
        <p className="text-sm text-slate-400 mb-2">או הזן את המפתח הסודי ידנית:</p>
        <div className="flex items-center gap-2">
          <code className="bg-input px-3 py-1 rounded text-amber-400 text-sm font-mono">
            {showSecret ? secret : "•".repeat(secret.length)}
          </code>
          <button onClick={() => setShowSecret(!showSecret)} className="text-slate-400 hover:text-foreground">
            {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
          <button onClick={() => navigator.clipboard?.writeText(secret)} className="text-slate-400 hover:text-amber-400">
            <Copy className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MfaSettingsSection() {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"status" | "setup" | "verify" | "backup">("status");
  const [verifyCode, setVerifyCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [showDisable, setShowDisable] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [totpSetup, setTotpSetup] = useState<TotpSetup | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const { data: mfaStatus, isLoading } = useQuery<MfaStatus>({
    queryKey: ["mfa-status"],
    queryFn: async () => {
      const r = await authFetch("/api/mfa/status");
      if (!r.ok) throw new Error("Failed to load MFA status");
      return r.json();
    },
  });

  const { data: roles = [] } = useQuery<any[]>({
    queryKey: ["platform-roles-mfa"],
    queryFn: async () => {
      const r = await authFetch("/api/platform/roles");
      return r.ok ? r.json() : [];
    },
    enabled: isAdmin,
  });

  const { data: mfaRequirements = [] } = useQuery<RoleMfaRequirement[]>({
    queryKey: ["mfa-admin-requirements"],
    queryFn: async () => {
      const r = await authFetch("/api/mfa/admin/requirements");
      return r.ok ? r.json() : [];
    },
    enabled: isAdmin,
  });

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user") || "null");
    setIsAdmin(user?.isSuperAdmin || false);
  }, []);

  const setupTotp = useMutation({
    mutationFn: async () => {
      const r = await authFetch("/api/mfa/totp/setup", { method: "POST" });
      if (!r.ok) throw new Error("Failed to setup TOTP");
      return r.json() as Promise<TotpSetup & { message: string }>;
    },
    onSuccess: (data) => {
      setTotpSetup(data);
      setStep("setup");
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const verifyTotp = useMutation({
    mutationFn: async (code: string) => {
      const r = await authFetch("/api/mfa/totp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Verification failed");
      return data;
    },
    onSuccess: (data) => {
      setBackupCodes(data.backupCodes || []);
      setStep("backup");
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["mfa-status"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const disableMfa = useMutation({
    mutationFn: async (code: string) => {
      const r = await authFetch("/api/mfa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed to disable MFA");
      return data;
    },
    onSuccess: () => {
      setSuccess("MFA הושבת בהצלחה");
      setShowDisable(false);
      setDisableCode("");
      queryClient.invalidateQueries({ queryKey: ["mfa-status"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const updateRoleMfa = useMutation({
    mutationFn: async ({ roleId, requireMfa, requireMfaForActions }: { roleId: number; requireMfa: boolean; requireMfaForActions: string[] }) => {
      const r = await authFetch(`/api/mfa/admin/requirements/${roleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requireMfa, requireMfaForActions }),
      });
      if (!r.ok) throw new Error("Failed to update MFA requirement");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mfa-admin-requirements"] });
      setSuccess("דרישות MFA עודכנו");
    },
  });

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-amber-400" /></div>;
  }

  const clearMessages = () => { setError(null); setSuccess(null); };

  return (
    <div className="p-4 md:p-6 space-y-6" dir="rtl">
      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm">{error}</span>
          <button onClick={() => setError(null)} className="mr-auto"><X className="h-4 w-4" /></button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-green-400">
          <CheckCircle className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm">{success}</span>
          <button onClick={() => setSuccess(null)} className="mr-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
            <Shield className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">אימות דו-שלבי (MFA)</h2>
            <p className="text-sm text-slate-400">הגן על החשבון שלך עם שכבת אבטחה נוספת</p>
          </div>
        </div>
        <Badge className={mfaStatus?.isEnabled ? "bg-green-500/20 text-green-400" : "bg-slate-500/20 text-slate-400"}>
          {mfaStatus?.isEnabled ? "מופעל" : "מכובה"}
        </Badge>
      </div>

      {mfaStatus?.isRequired && !mfaStatus?.isEnabled && (
        <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-amber-400">
          <Info className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm">MFA נדרש עבור התפקיד שלך. אנא הפעל אימות דו-שלבי.</span>
        </div>
      )}

      {step === "status" && (
        <div className="space-y-4">
          {!mfaStatus?.isEnabled ? (
            <Card className="bg-card border-border">
              <CardContent className="p-5 space-y-4">
                <h3 className="text-foreground font-semibold">בחר שיטת אימות</h3>
                <div className="grid gap-3">
                  <button
                    onClick={() => { clearMessages(); setupTotp.mutate(); }}
                    disabled={setupTotp.isPending}
                    className="flex items-center gap-3 bg-card hover:bg-muted border border-border rounded-lg p-4 text-right transition-colors"
                  >
                    <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Smartphone className="h-5 w-5 text-amber-400" />
                    </div>
                    <div>
                      <p className="text-foreground font-medium">אפליקציית אימות (TOTP)</p>
                      <p className="text-sm text-slate-400">Google Authenticator, Authy, ועוד</p>
                    </div>
                    {setupTotp.isPending && <Loader2 className="h-4 w-4 animate-spin mr-auto text-amber-400" />}
                  </button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-card border-border">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-3 text-green-400">
                  <ShieldCheck className="h-6 w-6" />
                  <div>
                    <p className="font-semibold">MFA פעיל</p>
                    <p className="text-sm text-slate-400">שיטה: {mfaStatus.method === "totp" ? "אפליקציית אימות" : "אימייל"}</p>
                    {mfaStatus.lastUsedAt && (
                      <p className="text-sm text-slate-400">שימוש אחרון: {new Date(mfaStatus.lastUsedAt).toLocaleDateString("he-IL")}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between bg-input rounded-lg p-3">
                  <span className="text-sm text-slate-300">קודי גיבוי זמינים</span>
                  <Badge className="bg-slate-700/50 text-slate-300">{mfaStatus.backupCodesCount}</Badge>
                </div>

                {!showDisable ? (
                  <Button
                    variant="outline"
                    className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                    onClick={() => setShowDisable(true)}
                  >
                    <ShieldX className="h-4 w-4 ml-2" />
                    השבת MFA
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-slate-300">הזן קוד MFA כדי לאשר השבתה:</p>
                    <div className="flex gap-2">
                      <Input
                        value={disableCode}
                        onChange={e => setDisableCode(e.target.value)}
                        placeholder="קוד אימות"
                        className="bg-input border-border text-foreground"
                        maxLength={8}
                      />
                      <Button
                        onClick={() => disableMfa.mutate(disableCode)}
                        disabled={disableMfa.isPending || !disableCode}
                        className="bg-red-500/20 text-red-400 hover:bg-red-500/30 border-red-500/30"
                        variant="outline"
                      >
                        {disableMfa.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "אשר"}
                      </Button>
                      <Button variant="ghost" onClick={() => { setShowDisable(false); setDisableCode(""); }}>ביטול</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {step === "setup" && totpSetup && (
        <Card className="bg-card border-border">
          <CardContent className="p-5 space-y-6">
            <div className="flex items-center gap-2">
              <button onClick={() => setStep("status")} className="text-slate-400 hover:text-foreground text-sm flex items-center gap-1">
                ← חזור
              </button>
            </div>
            <div className="text-center">
              <h3 className="text-foreground font-semibold text-lg mb-2">סרוק את קוד ה-QR</h3>
              <p className="text-slate-400 text-sm">פתח את אפליקציית האימות וסרוק:</p>
            </div>
            <QRCodeDisplay uri={totpSetup.uri} />
            <div className="space-y-2">
              <p className="text-sm text-slate-300">לאחר הסריקה, הזן את הקוד מהאפליקציה:</p>
              <div className="flex gap-2">
                <Input
                  value={verifyCode}
                  onChange={e => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  className="bg-input border-border text-foreground text-center text-2xl tracking-widest"
                  maxLength={6}
                />
                <Button
                  onClick={() => verifyTotp.mutate(verifyCode)}
                  disabled={verifyTotp.isPending || verifyCode.length < 6}
                  className="bg-amber-500 hover:bg-amber-600 text-black"
                >
                  {verifyTotp.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "אמת"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "backup" && (
        <Card className="bg-card border-border">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-3 text-green-400">
              <CheckCircle className="h-6 w-6" />
              <h3 className="font-semibold text-lg">MFA הופעל בהצלחה!</h3>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
              <p className="text-amber-400 text-sm font-semibold mb-2">שמור את קודי הגיבוי!</p>
              <p className="text-slate-400 text-sm">קודים אלו מאפשרים גישה לחשבון אם תאבד גישה לאפליקציית האימות. כל קוד ניתן לשימוש פעם אחת.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {backupCodes.map((code, i) => (
                <div key={i} className="bg-input rounded px-3 py-2 font-mono text-sm text-foreground text-center">
                  {code}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="border-border text-slate-300"
                onClick={() => {
                  navigator.clipboard?.writeText(backupCodes.join("\n"));
                  setSuccess("קודי גיבוי הועתקו");
                }}
              >
                <Copy className="h-4 w-4 ml-2" />
                העתק קודים
              </Button>
              <Button
                className="bg-amber-500 hover:bg-amber-600 text-black"
                onClick={() => { setStep("status"); setBackupCodes([]); }}
              >
                סיום
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <div className="space-y-4">
          <h3 className="text-foreground font-semibold flex items-center gap-2">
            <Key className="h-4 w-4 text-amber-400" />
            דרישות MFA לפי תפקיד
          </h3>
          <div className="space-y-2">
            {(roles as any[]).filter(r => r.isActive && !r.slug.startsWith("__")).map(role => {
              const req = mfaRequirements.find(r => r.roleId === role.id);
              return (
                <Card key={role.id} className="bg-card border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: role.color || "#6366f1" }} />
                        <span className="text-foreground text-sm font-medium">{role.nameHe || role.name}</span>
                      </div>
                      <button
                        onClick={() => updateRoleMfa.mutate({
                          roleId: role.id,
                          requireMfa: !(req?.requireMfa ?? false),
                          requireMfaForActions: req?.requireMfaForActions || [],
                        })}
                        className={`w-11 h-6 rounded-full transition-colors relative ${(req?.requireMfa ?? false) ? "bg-amber-500" : "bg-muted"}`}
                      >
                        <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all ${(req?.requireMfa ?? false) ? "right-0.5" : "right-[22px]"}`} />
                      </button>
                    </div>
                    {(req?.requireMfa ?? false) && (
                      <div className="space-y-1">
                        <p className="text-xs text-slate-400 mb-2">פעולות שדורשות MFA:</p>
                        <div className="flex flex-wrap gap-2">
                          {SENSITIVE_ACTIONS.map(action => {
                            const isRequired = (req?.requireMfaForActions || []).includes(action.key);
                            return (
                              <button
                                key={action.key}
                                onClick={() => {
                                  const current = req?.requireMfaForActions || [];
                                  const updated = isRequired
                                    ? current.filter(a => a !== action.key)
                                    : [...current, action.key];
                                  updateRoleMfa.mutate({ roleId: role.id, requireMfa: true, requireMfaForActions: updated });
                                }}
                                className={`text-xs px-2 py-1 rounded-full border transition-colors ${isRequired ? "bg-amber-500/20 border-amber-500/50 text-amber-400" : "bg-input border-border text-slate-400 hover:border-slate-400"}`}
                              >
                                {action.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
