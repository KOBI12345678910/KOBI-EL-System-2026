import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Key, Copy, Info, Lock } from "lucide-react";

const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") + "/api";

interface WebhookSecret {
  id: number;
  name: string;
  endpoint_path: string;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
}

export default function WebhookSecretsTab() {
  const { toast } = useToast();
  const [secrets, setSecrets] = useState<WebhookSecret[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", endpoint_path: "" });

  const getToken = () => localStorage.getItem("erp_auth_token");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/security/webhook-secrets`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSecrets(data.data || []);
      }
    } catch {
      toast({ title: "Failed to load webhook secrets", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.name.trim() || !form.endpoint_path.trim()) {
      toast({ title: "Name and endpoint path required", variant: "destructive" }); return;
    }
    try {
      const res = await fetch(`${API_BASE}/security/webhook-secrets`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const data = await res.json();
        setNewSecret(data.secret);
        setForm({ name: "", endpoint_path: "" });
        load();
      } else {
        const d = await res.json();
        toast({ title: d.error || "Failed", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", variant: "destructive" });
    }
  };

  const deleteSecret = async (id: number) => {
    try {
      await fetch(`${API_BASE}/security/webhook-secrets/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      toast({ title: "Webhook secret deleted" });
      load();
    } catch {
      toast({ title: "Failed", variant: "destructive" });
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied to clipboard" });
    } catch {
      toast({ title: "Failed to copy", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm bg-blue-50/50 dark:bg-blue-950/20">
        <CardContent className="p-4 flex items-start gap-3">
          <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-800 dark:text-blue-200">
            Webhook secrets are used to verify the authenticity of incoming webhook payloads via HMAC-SHA256 signatures.
            To validate a webhook: compute <code className="text-xs bg-blue-100 dark:bg-blue-900 px-1 rounded">HMAC-SHA256(secret, payload)</code> and compare with the
            <code className="text-xs bg-blue-100 dark:bg-blue-900 px-1 rounded mx-1">X-Webhook-Signature</code> header.
          </div>
        </CardContent>
      </Card>

      {newSecret && (
        <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Lock className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-sm text-green-800 dark:text-green-200">Webhook secret created — copy it now!</p>
                <code className="text-xs font-mono mt-1 block bg-green-100 dark:bg-green-900 px-2 py-1.5 rounded break-all">{newSecret}</code>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => copy(newSecret)}>
                  <Copy className="w-3.5 h-3.5 mr-1" /> Copy
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setNewSecret(null)}>Dismiss</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Create Webhook Secret</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Name (e.g. Stripe webhooks)"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              className="flex-1 min-w-[160px]"
            />
            <Input
              placeholder="Endpoint path (e.g. /api/webhook/stripe)"
              value={form.endpoint_path}
              onChange={e => setForm(p => ({ ...p, endpoint_path: e.target.value }))}
              className="flex-1 min-w-[200px]"
            />
            <Button onClick={create}>
              <Plus className="w-4 h-4 mr-1" /> Create
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Webhook Secrets ({secrets.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-6 text-muted-foreground">Loading...</div>
          ) : secrets.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">No webhook secrets configured</div>
          ) : (
            <div className="divide-y">
              {secrets.map(secret => (
                <div key={secret.id} className="flex items-center gap-3 py-3">
                  <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <Key className="w-3.5 h-3.5 text-slate-600" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-sm">{secret.name}</div>
                    <code className="text-xs text-muted-foreground font-mono">{secret.endpoint_path}</code>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {secret.last_used_at && <span>Last used: {new Date(secret.last_used_at).toLocaleDateString()}</span>}
                    <span>Created: {new Date(secret.created_at).toLocaleDateString()}</span>
                  </div>
                  <Badge variant={secret.is_active ? "default" : "secondary"} className="text-xs">
                    {secret.is_active ? "Active" : "Inactive"}
                  </Badge>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteSecret(secret.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Verification Example (Node.js)</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto whitespace-pre-wrap">
{`const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const computed = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(computed, 'hex')
  );
}

// In your Express handler:
app.post('/api/webhook/stripe', (req, res) => {
  const sig = req.headers['x-webhook-signature'];
  const valid = verifyWebhook(req.rawBody, sig, process.env.WEBHOOK_SECRET);
  if (!valid) return res.status(401).json({ error: 'Invalid signature' });
  // ... process webhook
});`}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
