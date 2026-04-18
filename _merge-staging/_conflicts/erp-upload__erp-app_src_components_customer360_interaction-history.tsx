import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

export default function InteractionHistory({ interactions }) {
  const totalValue = interactions.reduce((sum, int) => sum + (int.value || 0), 0);
  const avgResponseTime = Math.round(interactions.reduce((sum, int) => sum + (int.response_time || 0), 0) / interactions.length);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="w-5 h-5 text-indigo-600" />
          Interaction History & Engagement
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-3">
          <div className="p-3 bg-slate-50 rounded-lg">
            <p className="text-xs text-slate-600">Total Value</p>
            <p className="text-lg font-bold text-indigo-600">₪{totalValue.toLocaleString()}</p>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg">
            <p className="text-xs text-slate-600">Interactions</p>
            <p className="text-lg font-bold text-indigo-600">{interactions.length}</p>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg">
            <p className="text-xs text-slate-600">Avg Response</p>
            <p className="text-lg font-bold text-indigo-600">{avgResponseTime}h</p>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg">
            <p className="text-xs text-slate-600">Health Score</p>
            <p className="text-lg font-bold text-emerald-600">8.5/10</p>
          </div>
        </div>

        {/* Timeline */}
        <div className="space-y-3">
          {interactions.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-4">No interactions recorded</p>
          ) : (
            interactions.map((interaction, idx) => (
              <div key={interaction.id} className="p-3 border border-slate-200 rounded-lg">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-semibold text-slate-900 text-sm">{interaction.title}</p>
                    <p className="text-xs text-slate-600 mt-1">{interaction.details}</p>
                    <div className="flex gap-2 mt-2">
                      <Badge variant="outline" className="text-xs">{interaction.category}</Badge>
                      {interaction.value && (
                        <Badge className="bg-emerald-100 text-emerald-700 text-xs">
                          ₪{interaction.value.toLocaleString()}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 ml-2">
                    {format(new Date(interaction.date), 'dd MMM', { locale: he })}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}