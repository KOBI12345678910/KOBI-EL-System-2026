import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Copy, Key, Toggle, Trash2, Eye, EyeOff, AlertCircle } from "lucide-react";

const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") + "/api";

interface ApiKey {
  id: number;
  name: string;
  user_id: number;
  scopes: string[];
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
  usage_count: number;
  expires_at: string | null;
  key_preview: string;
}

const SCOPE_OPTIONS = [
  { value: "read", label: "Read Only — GET requests" },
  { value: "write", label: "Write — POST/PUT/PATCH/DELETE" },
  { value: "admin", label: "Admin — All methods" },
];

export default function ApiKeysSecurityTab() {
  const { toast } = useToast();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", scopes: ["read"], expires_in_days: "" });

  const getToken = () => localStorage.getItem("erp_auth_token");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api-keys`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setKeys(data.data || []);
      }
    } catch {
      toast({ title: "Failed to load API keys", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createKey = async () => {
    if (!form.name.trim()) { toast({ title: "Key name required", variant: "destructive" }); return; }
    try {
      const body: any = { name: form.name, scopes: form.scopes };
      if (form.expires_in_days) body.expires_in_days = parseInt(form.expires_in_days);
      const res = await fetch(`${API_BASE}/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setNewKey(data.api_key);
        setShowCreate(false);
        setForm({ name: "", scopes: ["read"], expires_in_days: "" });
        load();
      } else {
        const d = await res.json();
        toast({ title: d.error || "Failed", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", variant: "destructive" });
    }
  };

  const toggleKey = async (id: number) => {
    try {
      await fetch(`${API_BASE}/api-keys/${id}/toggle`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      load();
    } catch {
      toast({ title: "Failed", variant: "destructive" });
    }
  };

  const deleteKey = async (id: number) => {
    try {
      await fetch(`${API_BASE}/api-keys/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      toast({ title: "API key deleted" });
      load();
    } catch {
      toast({ title: "Failed", variant: "destructive" });
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied to clipboard" });
    } catch {
      toast({ title: "Failed to copy", variant: "destructive" });
    }
  };

  const isExpired = (key: ApiKey) => key.expires_at && new Date(key.expires_at) < new Date();
  const activeKeys = keys.filter(k => k.is_active && !isExpired(k)).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
              <Key className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <div className="text-xl font-bold text-green-600">{activeKeys}</div>
              <div className="text-xs text-muted-foreground">Active Keys</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
              <Key className="w-4 h-4 text-gray-500" />
            </div>
            <div>
              <div className="text-xl font-bold">{keys.length}</div>
              <div className="text-xs text-muted-foreground">Total Keys</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
              <AlertCircle className="w-4 h-4 text-red-500" />
            </div>
            <div>
              <div className="text-xl font-bold text-red-600">{keys.filter(k => isExpired(k)).length}</div>
              <div className="text-xs text-muted-foreground">Expired Keys</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {newKey && (
        <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-sm text-green-800 dark:text-green-200">API Key created — copy it now, it won't be shown again!</p>
                <code className="text-xs font-mono mt-1 block bg-green-100 dark:bg-green-900 px-2 py-1 rounded break-all">{newKey}</code>
              </div>
              <Button size="sm" variant="outline" onClick={() => copyToClipboard(newKey)}>
                <Copy className="w-3.5 h-3.5 mr-1" /> Copy
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setNewKey(null)}>Dismiss</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-1" /> Create API Key
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : keys.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No API keys created yet</div>
      ) : (
        <div className="space-y-2">
          {keys.map(key => {
            const expired = isExpired(key);
            return (
              <Card key={key.id} className={`border-0 shadow-sm ${!key.is_active || expired ? "opacity-60" : ""}`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <Key className="w-4 h-4 text-slate-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{key.name}</span>
                        {!key.is_active && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                        {expired && <Badge variant="destructive" className="text-xs">Expired</Badge>}
                        {key.scopes?.map(s => (
                          <Badge key={s} variant="outline" className="text-xs">{s}</Badge>
                        ))}
                      </div>
                      <div className="flex gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        <code className="font-mono">{key.key_preview}</code>
                        <span>Used {key.usage_count} times</span>
                        {key.last_used_at && <span>Last: {new Date(key.last_used_at).toLocaleDateString()}</span>}
                        {key.expires_at && (
                          <span className={expired ? "text-red-500" : ""}>
                            Expires: {new Date(key.expires_at).toLocaleDateString()}
                          </span>
                        )}
                        <span>Created: {new Date(key.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => toggleKey(key.id)}>
                        {key.is_active ? "Disable" : "Enable"}
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteKey(key.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              placeholder="Key name *"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            />
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Scopes</label>
              <div className="flex gap-2 flex-wrap">
                {SCOPE_OPTIONS.map(opt => (
                  <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.scopes.includes(opt.value)}
                      onChange={e => setForm(p => ({
                        ...p,
                        scopes: e.target.checked
                          ? [...p.scopes, opt.value]
                          : p.scopes.filter(s => s !== opt.value),
                      }))}
                    />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <Input
              placeholder="Expires in (days) — leave empty for no expiry"
              type="number"
              value={form.expires_in_days}
              onChange={e => setForm(p => ({ ...p, expires_in_days: e.target.value }))}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={createKey}>Create Key</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
