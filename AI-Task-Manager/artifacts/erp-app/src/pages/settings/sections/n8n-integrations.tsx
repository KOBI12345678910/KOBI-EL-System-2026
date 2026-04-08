import { useState } from "react";
import { Button, Input, Label, Card } from "@/components/ui-components";
import { Workflow, Trash2, RefreshCw, CheckCircle2, XCircle, Play, Pause, ExternalLink, AlertCircle } from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import { authFetch } from "@/lib/utils";

const API = "/api";

interface Workflow_ {
  id: string | number;
  name: string;
  status: string;
  lastRun: string;
  runs: number;
}

export default function N8NIntegrationsSection() {
  const [activeTab, setActiveTab] = useState("connection");
  const [n8nUrl, setN8nUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [workflows, setWorkflows] = useState<Workflow_[]>([]);

  const tabs = [
    { id: "connection", label: "חיבור" },
    { id: "workflows", label: "Workflows" },
    { id: "logs", label: "לוגים" },
  ];

  const handleTest = async () => {
    if (!n8nUrl || !apiKey) {
      setConnectionError("יש להזין כתובת URL ומפתח API");
      return;
    }
    setTesting(true);
    setConnectionError(null);
    try {
      const res = await authFetch(`${API}/n8n/test-connection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: n8nUrl, apiKey }),
      });
      const data = await res.json();
      if (data.success) {
        setConnected(true);
        setWorkflows(data.workflows || []);
      } else {
        setConnected(false);
        setConnectionError(data.error || "החיבור נכשל");
      }
    } catch {
      setConnected(false);
      setConnectionError("שגיאת רשת — לא ניתן לתקשר עם השרת");
    } finally {
      setTesting(false);
    }
  };

  const handleRefreshWorkflows = async () => {
    if (!connected || !n8nUrl || !apiKey) return;
    try {
      const res = await authFetch(`${API}/n8n/workflows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: n8nUrl, apiKey }),
      });
      const data = await res.json();
      setWorkflows(Array.isArray(data) ? data : []);
    } catch {}
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500/20 to-red-500/20 flex items-center justify-center">
          <Workflow className="w-5 h-5 text-orange-500" />
        </div>
        <div>
          <h1 className="text-lg sm:text-2xl font-bold">N8N Integrations</h1>
          <p className="text-sm text-muted-foreground">חיבור ותצורת N8N workflows אוטומטיים</p>
        </div>
        {connected && (
          <span className="flex items-center gap-1 text-xs text-green-400 bg-green-500/10 px-3 py-1.5 rounded-full mr-auto">
            <CheckCircle2 className="w-3.5 h-3.5" /> מחובר
          </span>
        )}
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
            <h3 className="text-lg font-semibold mb-4">הגדרות חיבור N8N</h3>
            <div className="space-y-4 max-w-lg">
              <div>
                <Label>כתובת N8N (URL)</Label>
                <Input
                  value={n8nUrl}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setN8nUrl(e.target.value); setConnected(false); }}
                  placeholder="https://n8n.yourcompany.com"
                  className="mt-1"
                  dir="ltr"
                />
                <p className="text-xs text-muted-foreground mt-1">כתובת מופע N8N שלך (self-hosted או cloud)</p>
              </div>
              <div>
                <Label>מפתח API</Label>
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setApiKey(e.target.value); setConnected(false); }}
                  placeholder="n8n_api_xxxxxxxxxxxxxxxx"
                  className="mt-1"
                  dir="ltr"
                />
                <p className="text-xs text-muted-foreground mt-1">ניתן למצוא ב-N8N תחת Settings → API Keys</p>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <Button onClick={handleTest} disabled={testing || !n8nUrl || !apiKey} className="gap-2">
                  <RefreshCw className={`w-4 h-4 ${testing ? "animate-spin" : ""}`} />
                  {testing ? "בודק חיבור..." : "בדוק חיבור"}
                </Button>
                {n8nUrl && (
                  <a href={n8nUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm" className="gap-1 text-xs">
                      <ExternalLink className="w-3.5 h-3.5" />
                      פתח N8N
                    </Button>
                  </a>
                )}
              </div>
              {connectionError && (
                <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 rounded-lg p-3">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {connectionError}
                </div>
              )}
              {connected && (
                <div className="flex items-center gap-2 text-sm text-green-400 bg-green-500/10 rounded-lg p-3">
                  <CheckCircle2 className="w-4 h-4" />
                  חיבור תקין! נמצאו {workflows.length} workflows
                </div>
              )}
            </div>
          </Card>

          <Card className="p-3 sm:p-6">
            <h3 className="text-lg font-semibold mb-4">webhook URL לשימוש ERP</h3>
            <div className="bg-muted/30 rounded-lg p-3 font-mono text-sm break-all" dir="ltr">
              {window.location.origin}/api/n8n/webhook
            </div>
            <p className="text-xs text-muted-foreground mt-2">הזן כתובת זו ב-N8N כ-Webhook URL לקבלת אירועים מה-ERP</p>
          </Card>
        </div>
      )}

      {activeTab === "workflows" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Workflows מחוברים</h3>
            {connected && (
              <Button size="sm" variant="outline" className="gap-2" onClick={handleRefreshWorkflows}>
                <RefreshCw className="w-4 h-4" />
                רענן
              </Button>
            )}
          </div>
          {!connected ? (
            <Card className="p-8 text-center">
              <Workflow className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-30" />
              <p className="text-sm text-muted-foreground">יש להתחבר ל-N8N תחילה</p>
            </Card>
          ) : workflows.length === 0 ? (
            <Card className="p-8 text-center">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-green-400 opacity-50" />
              <p className="text-sm text-muted-foreground">אין workflows זמינים במופע N8N</p>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-right p-3 font-medium text-xs text-muted-foreground">שם Workflow</th>
                    <th className="text-right p-3 font-medium text-xs text-muted-foreground">סטטוס</th>
                    <th className="text-right p-3 font-medium text-xs text-muted-foreground">עדכון אחרון</th>
                    <th className="text-right p-3 font-medium text-xs text-muted-foreground">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {workflows.map((wf) => (
                    <tr key={wf.id} className="border-b border-border hover:bg-muted/20">
                      <td className="p-3 font-medium">{wf.name}</td>
                      <td className="p-3">
                        {wf.status === "active" ? (
                          <span className="flex items-center gap-1 text-xs text-green-400 bg-green-500/10 px-2 py-1 rounded-full w-fit">
                            <CheckCircle2 className="w-3 h-3" /> פעיל
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-yellow-400 bg-yellow-500/10 px-2 py-1 rounded-full w-fit">
                            <Pause className="w-3 h-3" /> מושהה
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">{wf.lastRun}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          <button className="p-1 hover:bg-muted rounded" title="הפעל/השהה">
                            {wf.status === "active" ? <Pause className="w-3.5 h-3.5 text-muted-foreground" /> : <Play className="w-3.5 h-3.5 text-muted-foreground" />}
                          </button>
                          <button onClick={() => setWorkflows(prev => prev.filter(w => w.id !== wf.id))} className="p-1 hover:bg-red-500/10 rounded" title="הסר מהרשימה">
                            <Trash2 className="w-3.5 h-3.5 text-red-400" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}

      {activeTab === "logs" && (
        <Card className="p-3 sm:p-6">
          <h3 className="text-lg font-semibold mb-4">לוג פעילות N8N</h3>
          {connected ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-green-400 opacity-50" />
              <p className="text-sm">אין פעילות רשומה עדיין</p>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <XCircle className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">יש להתחבר ל-N8N כדי לראות לוגים</p>
            </div>
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="n8n-integrations" />
        <RelatedRecords entityType="n8n-integrations" />
      </div>
    </div>
  );
}
