import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, TrendingUp } from 'lucide-react';

export default function AssociatedDeals({ deals }) {
  const stageColors = {
    prospecting: 'bg-blue-100 text-blue-700',
    qualification: 'bg-indigo-100 text-indigo-700',
    proposal: 'bg-purple-100 text-purple-700',
    negotiation: 'bg-amber-100 text-amber-700',
    won: 'bg-emerald-100 text-emerald-700',
    lost: 'bg-red-100 text-red-700'
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-indigo-600" />
          Associated Deals ({deals.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {deals.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-4">No deals associated</p>
        ) : (
          deals.map(deal => (
            <div key={deal.id} className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-semibold text-slate-900">{deal.name}</p>
                  <p className="text-xs text-slate-500 mt-1">ID: {deal.id}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-indigo-600">₪{deal.amount.toLocaleString()}</p>
                  <p className="text-xs text-slate-500">{deal.probability}% close</p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Badge className={stageColors[deal.stage]}>{deal.stage}</Badge>
                <p className="text-xs text-slate-500">Close: {deal.close_date}</p>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}