import { useState } from "react";
import { Button, Input, Label, Card } from "@/components/ui-components";
import { BarChart3, TrendingUp, Globe, RefreshCw, Save, Plus, Trash2, Eye } from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";

export default function AdvancedAnalyticsSection() {
  const [activeTab, setActiveTab] = useState("connection");
  const [gaId, setGaId] = useState("G-XXXXXXXXXX");
  const [gtmId, setGtmId] = useState("");
  const [connected, setConnected] = useState(false);
  const [testing, setTesting] = useState(false);

  const tabs = [
    { id: "connection", label: "חיבור Analytics" },
    { id: "dashboards", label: "דשבורדים מותאמים" },
    { id: "events", label: "מעקב אירועים" },
    { id: "reports", label: "דוחות" },
  ];

  const handleConnect = async () => {
    setTesting(true);
    await new Promise(r => setTimeout(r, 1500));
    setConnected(true);
    setTesting(false);
  };

  const CUSTOM_DASHBOARDS = [
    { name: "סקירת מכירות", metrics: ["הכנסה חודשית", "לקוחות חדשים", "אחוז המרה"], views: 142 },
    { name: "ביצועי מוצרים", metrics: ["מוצרים נמכרים", "מלאי נמוך", "רווחיות"], views: 87 },
    { name: "פעילות משתמשים", metrics: ["כניסות יומיות", "זמן ממוצע במערכת", "עמודים נצפו"], views: 56 },
  ];

  const TRACKED_EVENTS = [
    { name: "יצירת הזמנה", key: "order_created", count: "1,240" },
    { name: "כניסת משתמש", key: "user_login", count: "3,891" },
    { name: "יצוא PDF", key: "pdf_export", count: "445" },
    { name: "שליחת חשבונית", key: "invoice_sent", count: "623" },
    { name: "עדכון לקוח", key: "customer_updated", count: "987" },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center">
          <BarChart3 className="w-5 h-5 text-blue-500" />
        </div>
        <div>
          <h1 className="text-lg sm:text-2xl font-bold">Advanced Analytics</h1>
          <p className="text-sm text-muted-foreground">הגדרות אנליטיקס מתקדמות, חיבור Google Analytics ומעקב אירועים</p>
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

      {activeTab === "connection" && (
        <div className="space-y-4">
          <Card className="p-3 sm:p-6">
            <div className="flex items-center gap-3 mb-4">
              <Globe className="w-5 h-5 text-blue-400" />
              <h3 className="text-lg font-semibold">Google Analytics</h3>
              {connected && (
                <span className="text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">מחובר</span>
              )}
            </div>
            <div className="space-y-4 max-w-lg">
              <div>
                <Label>Measurement ID (GA4)</Label>
                <Input value={gaId} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGaId(e.target.value)} placeholder="G-XXXXXXXXXX" className="mt-1 font-mono" />
                <p className="text-xs text-muted-foreground mt-1">ניתן למצוא ב-Admin → Data Streams → Measurement ID</p>
              </div>
              <div>
                <Label>Google Tag Manager ID (אופציונלי)</Label>
                <Input value={gtmId} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGtmId(e.target.value)} placeholder="GTM-XXXXXXX" className="mt-1 font-mono" />
              </div>
              <div className="flex gap-3">
                <Button onClick={handleConnect} disabled={testing} className="gap-2">
                  <RefreshCw className={`w-4 h-4 ${testing ? "animate-spin" : ""}`} />
                  {testing ? "מתחבר..." : "חבר Analytics"}
                </Button>
                <Button variant="outline" className="gap-2">
                  <Save className="w-4 h-4" />
                  שמור
                </Button>
              </div>
            </div>
          </Card>

          <Card className="p-3 sm:p-6">
            <h3 className="text-lg font-semibold mb-4">הגדרות נוספות</h3>
            <div className="space-y-3">
              {[
                { label: "מעקב אנונימי (IP Anonymization)", desc: "הסתרת כתובות IP של משתמשים (GDPR)", enabled: true },
                { label: "מעקב פעולות משתמש", desc: "מעקב אחר לחיצות, טפסים, ניווט", enabled: true },
                { label: "ייצוא נתונים ל-BigQuery", desc: "שליחת נתוני Analytics ל-BigQuery", enabled: false },
                { label: "דוחות בזמן אמת", desc: "עדכון דוחות כל 30 שניות", enabled: false },
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

      {activeTab === "dashboards" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">דשבורדים מותאמים</h3>
            <Button size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              דשבורד חדש
            </Button>
          </div>
          {CUSTOM_DASHBOARDS.map((dashboard, i) => (
            <Card key={i} className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold">{dashboard.name}</h4>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Eye className="w-3 h-3" /> {dashboard.views} צפיות
                  </span>
                  <Button variant="outline" size="sm">ערוך</Button>
                  <Button variant="outline" size="sm">צפה</Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {dashboard.metrics.map((metric) => (
                  <span key={metric} className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">{metric}</span>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {activeTab === "events" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">אירועים במעקב</h3>
            <Button size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              אירוע חדש
            </Button>
          </div>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-right p-3 font-medium text-xs text-muted-foreground">שם אירוע</th>
                  <th className="text-right p-3 font-medium text-xs text-muted-foreground">מפתח</th>
                  <th className="text-right p-3 font-medium text-xs text-muted-foreground">מספר אירועים (30 יום)</th>
                  <th className="text-right p-3 font-medium text-xs text-muted-foreground">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {TRACKED_EVENTS.map((event) => (
                  <tr key={event.key} className="border-b border-border hover:bg-muted/20">
                    <td className="p-3 font-medium">{event.name}</td>
                    <td className="p-3 font-mono text-xs text-muted-foreground">{event.key}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-3.5 h-3.5 text-green-400" />
                        <span className="font-medium">{event.count}</span>
                      </div>
                    </td>
                    <td className="p-3">
                      <button className="p-1 hover:bg-red-500/10 rounded">
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {activeTab === "reports" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { title: "דוח מכירות חודשי", desc: "סיכום הכנסות והזמנות לפי חודש", icon: BarChart3 },
            { title: "דוח לקוחות", desc: "ניתוח לקוחות חדשים וחוזרים", icon: TrendingUp },
            { title: "דוח מוצרים", desc: "מוצרים נמכרים ומלאי", icon: BarChart3 },
            { title: "דוח משתמשים", desc: "פעילות משתמשים ועמודים נצפו", icon: Eye },
          ].map((report, i) => (
            <Card key={i} className="p-5 hover:border-primary/40 transition-all cursor-pointer">
              <report.icon className="w-8 h-8 text-primary mb-3" />
              <h4 className="font-semibold mb-1">{report.title}</h4>
              <p className="text-xs text-muted-foreground mb-3">{report.desc}</p>
              <Button size="sm" variant="outline">הצג דוח</Button>
            </Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="advanced-analytics" />
        <RelatedRecords entityType="advanced-analytics" />
      </div>
    </div>
  );
}
