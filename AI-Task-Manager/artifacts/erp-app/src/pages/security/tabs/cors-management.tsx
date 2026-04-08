import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Globe, Info, ShieldCheck } from "lucide-react";

const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") + "/api";

interface CorsPolicy {
  id: number;
  origin: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export default function CorsManagementTab() {
  const { toast } = useToast();
  const [policies, setPolicies] = useState<CorsPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOrigin, setNewOrigin] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const getToken = () => localStorage.getItem("erp_auth_token");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/security/cors-policy`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPolicies(data.data || []);
      }
    } catch {
      toast({ title: "Failed to load CORS policy", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!newOrigin.trim()) { toast({ title: "Origin required", variant: "destructive" }); return; }
    try {
      const res = await fetch(`${API_BASE}/security/cors-policy`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ origin: newOrigin.trim(), description: newDesc }),
      });
      if (res.ok) {
        toast({ title: "CORS origin added" });
        setNewOrigin(""); setNewDesc("");
        load();
      } else {
        const d = await res.json();
        toast({ title: d.error || "Failed", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", variant: "destructive" });
    }
  };

  const remove = async (id: number) => {
    try {
      await fetch(`${API_BASE}/security/cors-policy/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      toast({ title: "Origin removed" });
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
            CORS (Cross-Origin Resource Sharing) controls which origins can access the API. In production, the allowed origins are configured via the
            <code className="text-xs bg-blue-100 dark:bg-blue-900 px-1 rounded mx-1">CORS_ORIGINS</code> environment variable.
            The entries below are stored for reference and can be used to update that variable.
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Add Allowed Origin</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Origin URL (e.g. https://app.example.com)"
              value={newOrigin}
              onChange={e => setNewOrigin(e.target.value)}
              className="flex-1 min-w-[200px]"
              onKeyDown={e => e.key === "Enter" && add()}
            />
            <Input
              placeholder="Description (optional)"
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              className="flex-1 min-w-[150px]"
            />
            <Button onClick={add}>
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Allowed Origins ({policies.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-6 text-muted-foreground">Loading...</div>
          ) : policies.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              No CORS origins stored. In development, all origins are allowed.
            </div>
          ) : (
            <div className="divide-y">
              {policies.map(policy => (
                <div key={policy.id} className="flex items-center gap-3 py-3">
                  <Globe className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <code className="font-mono text-sm flex-1">{policy.origin}</code>
                  {policy.description && <span className="text-xs text-muted-foreground">{policy.description}</span>}
                  <Badge variant={policy.is_active ? "default" : "secondary"} className="text-xs">
                    {policy.is_active ? "Active" : "Inactive"}
                  </Badge>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => remove(policy.id)}>
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
          <CardTitle className="text-base">Current CORS Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <ShieldCheck className="w-4 h-4 text-green-500" />
              <div>
                <div className="font-medium">CSRF Protection</div>
                <div className="text-xs text-muted-foreground">Origin/Referer header validation active on all mutating requests</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <ShieldCheck className="w-4 h-4 text-green-500" />
              <div>
                <div className="font-medium">Credentials Mode</div>
                <div className="text-xs text-muted-foreground">credentials: true — cookies and auth headers allowed</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Globe className="w-4 h-4 text-blue-500" />
              <div>
                <div className="font-medium">Production Mode</div>
                <div className="text-xs text-muted-foreground">Only origins in CORS_ORIGINS env variable are allowed</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Globe className="w-4 h-4 text-yellow-500" />
              <div>
                <div className="font-medium">Development Mode</div>
                <div className="text-xs text-muted-foreground">All origins allowed (origin: true)</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
