import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { entityFilter } from "@/lib/entity-api";
import { useQuery } from "@tanstack/react-query";
import { Globe, MessageCircle, Mail, Zap } from "lucide-react";

interface WebhookStats {
  total: number;
  today: number;
  by_source: Record<string, number>;
}

export default function WebhookLeadReceiver() {
  const [webhookStats, setWebhookStats] = useState<WebhookStats>({
    total: 0,
    today: 0,
    by_source: {},
  });

  const { data: recentLeads = [] } = useQuery({
    queryKey: ["webhookLeads"],
    queryFn: async () => {
      const leads = await entityFilter<any>("leads", {
        source: "website",
      });
      return leads.slice(0, 10);
    },
    refetchInterval: 5000,
  });

  useEffect(() => {
    // Note: Real-time subscribe is not available in the migrated API.
    // Using polling via refetchInterval instead.
    // If a WebSocket/SSE endpoint is available, connect here.
  }, []);

  const sourceIcons: Record<string, any> = {
    website: Globe,
    facebook: MessageCircle,
    whatsapp: MessageCircle,
    gmail: Mail,
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-yellow-500" />
          Webhook Lead Receiver - Real-time
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-300">
            <p className="text-slate-600 text-sm">Total Leads</p>
            <p className="text-3xl font-bold text-blue-600">{webhookStats.total}</p>
          </div>
          <div className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border border-green-300">
            <p className="text-slate-600 text-sm">Today</p>
            <p className="text-3xl font-bold text-green-600">{webhookStats.today}</p>
          </div>
        </div>

        {/* By Source */}
        {Object.entries(webhookStats.by_source).length > 0 && (
          <div className="space-y-3">
            <h3 className="font-bold text-slate-900">By Source:</h3>
            <div className="space-y-2">
              {Object.entries(webhookStats.by_source).map(
                ([source, count]) => {
                  const Icon = sourceIcons[source] || Globe;
                  return (
                    <div
                      key={source}
                      className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200"
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="w-5 h-5 text-slate-500" />
                        <span className="font-medium capitalize">{source}</span>
                      </div>
                      <Badge variant="outline">{count}</Badge>
                    </div>
                  );
                }
              )}
            </div>
          </div>
        )}

        {/* Recent Leads */}
        {recentLeads.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-bold text-slate-900">Recent Leads:</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {recentLeads.map((lead: any) => (
                <div
                  key={lead.id}
                  className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex justify-between items-center text-sm"
                >
                  <div>
                    <p className="font-medium">{lead.full_name}</p>
                    <p className="text-xs text-slate-600">{lead.phone}</p>
                  </div>
                  <Badge className="bg-indigo-100 text-indigo-700">
                    {lead.source}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Webhook URL Info */}
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-lg">
          <p className="text-xs font-mono text-amber-900 break-all">
            POST /webhooks/lead
          </p>
          <p className="text-xs text-amber-700 mt-2">
            Configure webhook in the external service to receive leads in real-time
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
