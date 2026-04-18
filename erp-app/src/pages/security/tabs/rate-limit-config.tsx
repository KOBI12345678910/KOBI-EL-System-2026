import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Zap, Info } from "lucide-react";

const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") + "/api";

interface RateLimitConfig {
  id: number;
  endpoint_pattern: string;
  max_requests: number;
  window_seconds: number;
  scope: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

const DEFAULT_LIMITS = [
  { endpoint_pattern: "/api/auth/login", max_requests: 10, window_seconds: 60, scope: "per_ip", description: "Login rate limit" },
  { endpoint_pattern: "/api/ai/*", max_requests: 20, window_seconds: 60, scope: "per_user", description: "AI endpoint limit" },
  { endpoint_pattern: "/api/auth/forgot-password", max_requests: 3, window_seconds: 900, scope: "per_ip", description: "Forgot password limit" },
  { endpoint_pattern: "/api/*", max_requests: 200, window_seconds: 60, scope: "per_user", description: "Global per-user limit" },
];

export default function RateLimitTab() {
  const { toast } = useToast();
  const [configs, setConfigs] = useState<RateLimitConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPattern, setNewPattern] = useState("");
  const [newMax, setNewMax] = useState("100");
  const [newWindow, setNewWindow] = useState("60");
  const [newScope, setNewScope] = useState("per_user");
  const [newDesc, setNewDesc] = useState("");

  const getToken = () => localStorage.getItem("erp_auth_token");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/security/rate-limit-config`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setConfigs(data.data || []);
      }
    } catch {
      toast({ title: "Failed to load rate limit config", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addConfig = async () => {
    if (!newPattern.trim()) { toast({ title: "Enter an endpoint pattern", variant: "destructive" }); return; }
    try {
      const res = await fetch(`${API_BASE}/security/rate-limit-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ endpoint_pattern: newPattern.trim(), max_requests: parseInt(newMax), window_seconds: parseInt(newWindow), scope: newScope, description: newDesc }),
      });
      if (res.ok) {
        toast({ title: "Rate limit rule added" });
        setNewPattern(""); setNewDesc("");
        load();
      } else {
        const d = await res.json();
        toast({ title: d.error || "Failed", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", variant: "destructive" });
    }
  };

  const quickAdd = async (preset: typeof DEFAULT_LIMITS[0]) => {
    try {
      const res = await fetch(`${API_BASE}/security/rate-limit-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(preset),
      });
      if (res.ok) {
        toast({ title: "Preset applied" });
        load();
      } else {
        const d = await res.json();
        toast({ title: d.error || "Already exists", variant: "destructive" });
      }
    } catch {}
  };

  const deleteConfig = async (id: number) => {
    try {
      await fetch(`${API_BASE}/security/rate-limit-config/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      toast({ title: "Rule deleted" });
      load();
    } catch {
      toast({ title: "Failed", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm bg-blue-50/50 dark:bg-blue-950/20">
        <CardContent className="p-4 flex items-start gap-3">
          <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-800 dark:text-blue-200">
            Rules added here are <strong>actively enforced</strong> on the API server using an in-memory sliding-window counter. Patterns support glob syntax (e.g. <code className="text-xs bg-blue-100 dark:bg-blue-900 px-1 rounded">/api/reports/*</code>). The most specific pattern (longest match) wins. On limit exceeded, the server responds with HTTP 429 and includes <code className="text-xs bg-blue-100 dark:bg-blue-900 px-1 rounded">X-RateLimit-*</code> headers.
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Quick Presets</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {DEFAULT_LIMITS.map(preset => (
              <Button key={preset.endpoint_pattern} variant="outline" size="sm" onClick={() => quickAdd(preset)}>
                <Zap className="w-3 h-3 mr-1" />
                {preset.endpoint_pattern} ({preset.max_requests}/{preset.window_seconds}s)
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Add Custom Rule</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Endpoint pattern (e.g. /api/reports/*)"
              value={newPattern}
              onChange={e => setNewPattern(e.target.value)}
              className="flex-1 min-w-[200px]"
            />
            <Input
              placeholder="Max requests"
              type="number"
              value={newMax}
              onChange={e => setNewMax(e.target.value)}
              className="w-32"
            />
            <Input
              placeholder="Window (sec)"
              type="number"
              value={newWindow}
              onChange={e => setNewWindow(e.target.value)}
              className="w-28"
            />
            <Select value={newScope} onValueChange={setNewScope}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="per_user">Per User</SelectItem>
                <SelectItem value="per_ip">Per IP</SelectItem>
                <SelectItem value="per_api_key">Per API Key</SelectItem>
                <SelectItem value="global">Global</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Description"
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              className="flex-1 min-w-[150px]"
            />
            <Button onClick={addConfig}>
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Configured Rules ({configs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-6 text-muted-foreground">Loading...</div>
          ) : configs.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">No custom rate limit rules configured</div>
          ) : (
            <div className="divide-y">
              {configs.map(config => (
                <div key={config.id} className="flex items-center gap-3 py-3 flex-wrap">
                  <code className="font-mono text-sm bg-muted px-2 py-1 rounded flex-1 min-w-[150px]">{config.endpoint_pattern}</code>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs font-mono">
                      {config.max_requests} req / {config.window_seconds}s
                    </Badge>
                    <Badge variant="secondary" className="text-xs">{config.scope}</Badge>
                  </div>
                  {config.description && <span className="text-xs text-muted-foreground flex-1">{config.description}</span>}
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteConfig(config.id)}>
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
          <CardTitle className="text-base">Active Global Rate Limits</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y text-sm">
            {[
              { label: "Auth endpoints (login/register)", limit: "100 req / 15 min", scope: "per IP" },
              { label: "AI endpoints (claude, kimi, ai-*)", limit: "20 req / 1 min (prod) · 200 (dev)", scope: "per IP" },
              { label: "File uploads", limit: "10 req / 1 min (prod) · 100 (dev)", scope: "per IP" },
              { label: "All API endpoints", limit: "500 req / 15 min (prod) · 5000 (dev)", scope: "per IP" },
              { label: "Per-user requests", limit: "200 req / 1 min", scope: "per user" },
              { label: "Heavy endpoints", limit: "20 req / 1 min", scope: "per user" },
            ].map(item => (
              <div key={item.label} className="py-2.5 flex items-center gap-3">
                <div className="flex-1">
                  <span className="font-medium">{item.label}</span>
                </div>
                <Badge variant="outline" className="font-mono text-xs">{item.limit}</Badge>
                <Badge variant="secondary" className="text-xs">{item.scope}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
