import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Globe, Plus, Trash2, Info } from "lucide-react";

const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") + "/api";

interface GeoRule {
  id: number;
  country_code: string;
  country_name: string;
  rule_type: "allow" | "deny";
  is_active: boolean;
  created_at: string;
}

const COMMON_COUNTRIES = [
  { code: "IL", name: "Israel" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "CN", name: "China" },
  { code: "RU", name: "Russia" },
  { code: "KP", name: "North Korea" },
  { code: "IR", name: "Iran" },
  { code: "SY", name: "Syria" },
  { code: "CU", name: "Cuba" },
  { code: "SS", name: "South Sudan" },
  { code: "YE", name: "Yemen" },
  { code: "AF", name: "Afghanistan" },
  { code: "LY", name: "Libya" },
  { code: "MM", name: "Myanmar" },
  { code: "UA", name: "Ukraine" },
  { code: "BY", name: "Belarus" },
  { code: "VE", name: "Venezuela" },
];

export default function GeoBlockingTab() {
  const { toast } = useToast();
  const [rules, setRules] = useState<GeoRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCountry, setSelectedCountry] = useState("");
  const [ruleType, setRuleType] = useState<"allow" | "deny">("deny");

  const getToken = () => localStorage.getItem("erp_auth_token");

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/security/geo-rules`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRules(data.data || []);
      }
    } catch {
      toast({ title: "Failed to load geo rules", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRules(); }, [loadRules]);

  const addRule = async () => {
    if (!selectedCountry) { toast({ title: "Select a country", variant: "destructive" }); return; }
    const country = COMMON_COUNTRIES.find(c => c.code === selectedCountry);
    try {
      const res = await fetch(`${API_BASE}/security/geo-rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ country_code: selectedCountry, country_name: country?.name || selectedCountry, rule_type: ruleType }),
      });
      if (res.ok) {
        toast({ title: "Geo rule added" });
        setSelectedCountry("");
        loadRules();
      } else {
        const d = await res.json();
        toast({ title: d.error || "Failed", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", variant: "destructive" });
    }
  };

  const deleteRule = async (id: number) => {
    try {
      await fetch(`${API_BASE}/security/geo-rules/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      toast({ title: "Rule removed" });
      loadRules();
    } catch {
      toast({ title: "Failed", variant: "destructive" });
    }
  };

  const denyRules = rules.filter(r => r.rule_type === "deny");
  const allowRules = rules.filter(r => r.rule_type === "allow");

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm bg-blue-50/50 dark:bg-blue-950/20 border-blue-200/50">
        <CardContent className="p-4 flex items-start gap-3">
          <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-800 dark:text-blue-200">
            <strong>How geo-blocking works:</strong> Country code is detected from the <code className="text-xs bg-blue-100 dark:bg-blue-900 px-1 rounded">CF-IPCountry</code> or{" "}
            <code className="text-xs bg-blue-100 dark:bg-blue-900 px-1 rounded">X-Country-Code</code> header (set by Cloudflare or your proxy).
            If you add <strong>deny</strong> rules, those countries are blocked. If you add <strong>allow</strong> rules, only those countries are permitted (all others blocked).
            Mix of both rules is not recommended.
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Add Geo Rule</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Select value={selectedCountry} onValueChange={setSelectedCountry}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select country..." />
              </SelectTrigger>
              <SelectContent>
                {COMMON_COUNTRIES.map(c => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.name} ({c.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={ruleType} onValueChange={v => setRuleType(v as any)}>
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="deny">Deny</SelectItem>
                <SelectItem value="allow">Allow</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={addRule}>
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              Blocked Countries ({denyRules.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-4 text-muted-foreground">Loading...</div>
            ) : denyRules.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground text-sm">No countries blocked</div>
            ) : (
              <div className="divide-y">
                {denyRules.map(rule => (
                  <div key={rule.id} className="flex items-center gap-3 py-2.5">
                    <Globe className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1">
                      <span className="font-medium text-sm">{rule.country_name}</span>
                      <span className="text-xs text-muted-foreground ml-2">({rule.country_code})</span>
                    </div>
                    <Badge variant="destructive" className="text-xs">Denied</Badge>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => deleteRule(rule.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              Allowed Countries ({allowRules.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {allowRules.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground text-sm">
                No allowlist — all countries allowed (except denied)
              </div>
            ) : (
              <div className="divide-y">
                {allowRules.map(rule => (
                  <div key={rule.id} className="flex items-center gap-3 py-2.5">
                    <Globe className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1">
                      <span className="font-medium text-sm">{rule.country_name}</span>
                      <span className="text-xs text-muted-foreground ml-2">({rule.country_code})</span>
                    </div>
                    <Badge className="text-xs bg-green-100 text-green-800">Allowed</Badge>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => deleteRule(rule.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm bg-amber-50/50 dark:bg-amber-950/20">
        <CardContent className="p-4 flex items-start gap-3">
          <Info className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-amber-800 dark:text-amber-200">
            <strong>Emergency bypass:</strong> If you get locked out, set the{" "}
            <code className="text-xs bg-amber-100 dark:bg-amber-900 px-1 rounded">EMERGENCY_BYPASS_TOKEN</code> environment variable and
            include the header <code className="text-xs bg-amber-100 dark:bg-amber-900 px-1 rounded">X-Emergency-Bypass: &lt;token&gt;</code> in your request.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
