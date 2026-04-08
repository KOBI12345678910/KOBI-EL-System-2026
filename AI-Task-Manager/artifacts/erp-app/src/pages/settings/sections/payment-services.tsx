import { useState } from "react";
import { Button, Input, Label, Card } from "@/components/ui-components";
import { CreditCard, CheckCircle2, XCircle, RefreshCw, Save, Globe, DollarSign, TestTube, AlertTriangle } from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";

interface PaymentProvider {
  id: string;
  name: string;
  logo: string;
  description: string;
  color: string;
  bgColor: string;
  requiresBackendSetup?: boolean;
  setupNote?: string;
  fields: { key: string; label: string; type: string; placeholder?: string }[];
}

const PROVIDERS: PaymentProvider[] = [
  {
    id: "stripe",
    name: "Stripe",
    logo: "S",
    description: "עיבוד תשלומים מוביל בעולם — כרטיסי אשראי, PayPal, Apple Pay",
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
    requiresBackendSetup: true,
    setupNote: "נדרש הגדרת Secret Key בצד השרת — לא ניתן לחיבור ישיר",
    fields: [
      { key: "publishableKey", label: "Publishable Key", type: "text", placeholder: "pk_live_..." },
      { key: "secretKey", label: "Secret Key", type: "password", placeholder: "sk_live_..." },
      { key: "webhookSecret", label: "Webhook Secret", type: "password", placeholder: "whsec_..." },
    ],
  },
  {
    id: "paypal",
    name: "PayPal",
    logo: "P",
    description: "תשלומי PayPal וכרטיסי אשראי דרך PayPal Commerce",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    requiresBackendSetup: true,
    setupNote: "נדרש הגדרה בצד השרת — לא ניתן לחיבור ישיר",
    fields: [
      { key: "clientId", label: "Client ID", type: "text", placeholder: "AXxx..." },
      { key: "clientSecret", label: "Client Secret", type: "password" },
      { key: "mode", label: "מצב", type: "select" },
    ],
  },
  {
    id: "tranzila",
    name: "Tranzila (ישראל)",
    logo: "T",
    description: "מסוף תשלומים ישראלי — שקלים, תשלומים, תשלום בהוראת קבע",
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/10",
    fields: [
      { key: "terminalName", label: "שם מסוף", type: "text", placeholder: "yourcompany" },
      { key: "password", label: "סיסמת מסוף", type: "password" },
      { key: "supplierId", label: "מזהה ספק", type: "text" },
    ],
  },
];

export default function PaymentServicesSection() {
  const [activeTab, setActiveTab] = useState("providers");
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [providerData, setProviderData] = useState<Record<string, Record<string, string>>>({});
  const [connectedProviders, setConnectedProviders] = useState<string[]>([]);
  const [currency, setCurrency] = useState("ILS");
  const [testMode, setTestMode] = useState(true);
  const [testing, setTesting] = useState(false);

  const tabs = [
    { id: "providers", label: "ספקי תשלום" },
    { id: "settings", label: "הגדרות כלליות" },
    { id: "logs", label: "עסקאות" },
  ];

  const handleTest = async (providerId: string) => {
    const provider = PROVIDERS.find(p => p.id === providerId);
    if (provider?.requiresBackendSetup) {
      return;
    }
    setTesting(true);
    await new Promise(r => setTimeout(r, 1500));
    setConnectedProviders(prev => [...prev, providerId]);
    setTesting(false);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-green-500/20 flex items-center justify-center">
          <CreditCard className="w-5 h-5 text-emerald-500" />
        </div>
        <div>
          <h1 className="text-lg sm:text-2xl font-bold">שרותי תשלום</h1>
          <p className="text-sm text-muted-foreground">תצורת שירותי תשלום, מפתחות, מטבע ובדיקות חיבור</p>
        </div>
      </div>

      <div className="flex gap-1 mb-6 border-b border-border overflow-x-auto pb-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "providers" && (
        <div className="space-y-4">
          {PROVIDERS.map((provider) => {
            const isConnected = connectedProviders.includes(provider.id);
            const isExpanded = selectedProvider === provider.id;

            return (
              <Card key={provider.id} className={`p-5 transition-all ${isExpanded ? "border-primary/30" : ""}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 ${provider.bgColor} rounded-xl flex items-center justify-center font-bold text-xl ${provider.color}`}>
                      {provider.logo}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold">{provider.name}</h4>
                        {provider.requiresBackendSetup ? (
                          <span className="flex items-center gap-1 text-xs text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">
                            <AlertTriangle className="w-3 h-3" /> לא מוגדר — נדרשת הגדרה
                          </span>
                        ) : isConnected ? (
                          <span className="flex items-center gap-1 text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3" /> מחובר
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{provider.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!provider.requiresBackendSetup && isConnected && (
                      <Button variant="outline" size="sm" onClick={() => handleTest(provider.id)} disabled={testing} className="gap-1 text-xs">
                        <TestTube className="w-3.5 h-3.5" />
                        בדוק
                      </Button>
                    )}
                    <Button
                      variant={isExpanded ? "primary" : "outline"}
                      size="sm"
                      onClick={() => setSelectedProvider(isExpanded ? null : provider.id)}
                    >
                      {isExpanded ? "סגור" : "הגדר"}
                    </Button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-border">
                    {provider.requiresBackendSetup && (
                      <div className="mb-4 flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 text-xs">
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                        <div>
                          <div className="font-semibold mb-0.5">לא מוגדר — נדרשת הגדרה</div>
                          <div>{provider.setupNote}</div>
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {provider.fields.map((field) => (
                        <div key={field.key}>
                          <Label className="text-xs">{field.label}</Label>
                          {field.type === "select" ? (
                            <select className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm">
                              <option value="sandbox">Sandbox (בדיקות)</option>
                              <option value="live">Live (ייצור)</option>
                            </select>
                          ) : (
                            <Input
                              type={field.type}
                              placeholder={field.placeholder}
                              value={providerData[provider.id]?.[field.key] || ""}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                setProviderData(prev => ({
                                  ...prev,
                                  [provider.id]: { ...prev[provider.id], [field.key]: e.target.value }
                                }))
                              }
                              className="mt-1"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 mt-4">
                      {!provider.requiresBackendSetup && (
                        <Button size="sm" onClick={() => handleTest(provider.id)} disabled={testing} className="gap-2">
                          <RefreshCw className={`w-3.5 h-3.5 ${testing ? "animate-spin" : ""}`} />
                          {testing ? "בודק..." : "בדוק חיבור"}
                        </Button>
                      )}
                      <Button variant="outline" size="sm" className="gap-2">
                        <Save className="w-3.5 h-3.5" />
                        שמור
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {activeTab === "settings" && (
        <div className="space-y-4">
          <Card className="p-3 sm:p-6">
            <h3 className="text-lg font-semibold mb-4">הגדרות תשלום כלליות</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>מטבע ברירת מחדל</Label>
                <select
                  className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  <option value="ILS">₪ שקל ישראלי (ILS)</option>
                  <option value="USD">$ דולר אמריקאי (USD)</option>
                  <option value="EUR">€ יורו (EUR)</option>
                  <option value="GBP">£ ליש"ט (GBP)</option>
                </select>
              </div>
              <div>
                <Label>מצב סביבה</Label>
                <div className="flex items-center gap-3 mt-2">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={testMode} onChange={() => setTestMode(!testMode)} />
                    <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:bg-yellow-500 transition-colors after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-card after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-[-20px]" />
                  </label>
                  <span className={`text-sm font-medium ${testMode ? "text-yellow-400" : "text-green-400"}`}>
                    {testMode ? "מצב בדיקות (Sandbox)" : "מצב ייצור (Live)"}
                  </span>
                </div>
              </div>
              <div>
                <Label>מינימום סכום עסקה (₪)</Label>
                <Input defaultValue="1" type="number" className="mt-1" />
              </div>
              <div>
                <Label>מקסימום סכום עסקה (₪)</Label>
                <Input defaultValue="50000" type="number" className="mt-1" />
              </div>
              <div>
                <Label>מספר תשלומים מקסימלי</Label>
                <select className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm">
                  <option value="1">תשלום אחד</option>
                  <option value="3">3 תשלומים</option>
                  <option value="6">6 תשלומים</option>
                  <option value="12">12 תשלומים</option>
                  <option value="36">36 תשלומים</option>
                </select>
              </div>
              <div>
                <Label>מטבע תחושת ברירת מחדל</Label>
                <Input defaultValue="ILS" className="mt-1" readOnly />
              </div>
            </div>
            <div className="mt-4">
              <Button className="gap-2">
                <Save className="w-4 h-4" />
                שמור הגדרות
              </Button>
            </div>
          </Card>

          <Card className="p-3 sm:p-6">
            <h3 className="text-lg font-semibold mb-4">הגדרות אבטחה</h3>
            <div className="space-y-3">
              {[
                { label: "הצפנת SSL בעסקאות", desc: "כל עסקה מוצפנת עם SSL/TLS", enabled: true },
                { label: "אימות 3D Secure", desc: "אימות נוסף לכרטיסי אשראי", enabled: false },
                { label: "שמירת פרטי כרטיס (Tokenization)", desc: "שמירה מאובטחת לרכישות חוזרות", enabled: true },
                { label: "התראות על עסקאות חשודות", desc: "קבלת התראה על פעילות חריגה", enabled: true },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div>
                    <p className="font-medium text-sm">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" defaultChecked={item.enabled} />
                    <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:bg-primary transition-colors after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-card after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-[-20px]" />
                  </label>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {activeTab === "logs" && (
        <Card className="overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="font-semibold">היסטוריית עסקאות</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-right p-3 font-medium text-xs text-muted-foreground">תאריך</th>
                <th className="text-right p-3 font-medium text-xs text-muted-foreground">מזהה עסקה</th>
                <th className="text-right p-3 font-medium text-xs text-muted-foreground">ספק</th>
                <th className="text-right p-3 font-medium text-xs text-muted-foreground">סכום</th>
                <th className="text-right p-3 font-medium text-xs text-muted-foreground">סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {[
                { date: "17/03/2026", id: "pi_3Oa1BcE", provider: "Stripe", amount: "₪1,200", status: "הצליח" },
                { date: "17/03/2026", id: "pi_3Oa1AbD", provider: "Stripe", amount: "₪450", status: "הצליח" },
                { date: "16/03/2026", id: "pi_3Oa0ZcC", provider: "Tranzila", amount: "₪3,500", status: "הצליח" },
                { date: "15/03/2026", id: "pi_3Oa0YbB", provider: "Stripe", amount: "₪890", status: "נכשל" },
                { date: "15/03/2026", id: "pi_3Oa0XaA", provider: "PayPal", amount: "₪2,100", status: "הצליח" },
              ].map((tx, i) => (
                <tr key={i} className="border-b border-border hover:bg-muted/20">
                  <td className="p-3 text-xs text-muted-foreground">{tx.date}</td>
                  <td className="p-3 font-mono text-xs">{tx.id}</td>
                  <td className="p-3 text-xs">{tx.provider}</td>
                  <td className="p-3 font-medium">{tx.amount}</td>
                  <td className="p-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${tx.status === "הצליח" ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                      {tx.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="payment-services" />
        <RelatedRecords entityType="payment-services" />
      </div>
    </div>
  );
}
