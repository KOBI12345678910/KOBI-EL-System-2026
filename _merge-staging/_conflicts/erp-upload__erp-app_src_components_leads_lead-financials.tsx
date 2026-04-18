import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DollarSign } from 'lucide-react';

interface LeadFinancialsProps {
  lead: any;
  editing: boolean;
  formData: any;
  onChange: (key: string, value: any) => void;
}

export default function LeadFinancials({ lead, editing, formData, onChange }: LeadFinancialsProps) {
  const quoteStatusColors: Record<string, string> = {
    sent: 'bg-blue-100 text-blue-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800'
  };

  return (
    <Card className="border-yellow-200 bg-yellow-50">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-yellow-600" />
          Quotes & Financials
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold text-slate-600">Quote Number</label>
            {editing ? (
              <Input
                value={formData.quote_number || ''}
                onChange={(e) => onChange('quote_number', e.target.value)}
                className="text-sm mt-1"
              />
            ) : (
              <p className="font-semibold">{lead.quote_number || '\u2014'}</p>
            )}
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-600">Quote Status</label>
            {editing ? (
              <select
                value={formData.quote_status || ''}
                onChange={(e) => onChange('quote_status', e.target.value)}
                className="w-full border rounded px-2 py-1 text-sm mt-1"
              >
                <option value="">Select</option>
                <option value="sent">Sent</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            ) : (
              <Badge className={quoteStatusColors[lead.quote_status]}>
                {lead.quote_status === 'sent' ? 'Sent' : lead.quote_status === 'approved' ? 'Approved' : 'Rejected'}
              </Badge>
            )}
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-600">Amount Before Tax</label>
            {editing ? (
              <Input
                type="number"
                value={formData.amount_before_vat || ''}
                onChange={(e) => onChange('amount_before_vat', parseFloat(e.target.value))}
                className="text-sm mt-1"
              />
            ) : (
              <p className="font-semibold">${(lead.amount_before_vat || 0).toLocaleString()}</p>
            )}
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-600">Total Amount (with Tax)</label>
            {editing ? (
              <Input
                type="number"
                value={formData.total_amount || ''}
                onChange={(e) => onChange('total_amount', parseFloat(e.target.value))}
                className="text-sm mt-1"
              />
            ) : (
              <p className="font-bold text-lg text-green-700">${(lead.total_amount || 0).toLocaleString()}</p>
            )}
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-600">Payment Terms</label>
            {editing ? (
              <select
                value={formData.payment_terms || ''}
                onChange={(e) => onChange('payment_terms', e.target.value)}
                className="w-full border rounded px-2 py-1 text-sm mt-1"
              >
                <option value="">Select</option>
                <option value="cash">Cash</option>
                <option value="transfer">Transfer</option>
                <option value="net_30">Net 30</option>
                <option value="net_60">Net 60</option>
                <option value="installments">Installments</option>
              </select>
            ) : (
              <p className="font-semibold">
                {lead.payment_terms === 'cash' ? 'Cash' : lead.payment_terms === 'transfer' ? 'Transfer' : lead.payment_terms}
              </p>
            )}
          </div>

          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer w-full">
              <input
                type="checkbox"
                disabled={!editing}
                checked={formData.advance_required || lead.advance_required || false}
                onChange={(e) => onChange('advance_required', e.target.checked)}
              />
              <span className="text-sm">Advance Required</span>
            </label>
          </div>

          {(formData.advance_required || lead.advance_required) && (
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer w-full">
                <input
                  type="checkbox"
                  disabled={!editing}
                  checked={formData.advance_received || lead.advance_received || false}
                  onChange={(e) => onChange('advance_received', e.target.checked)}
                />
                <span className="text-sm">Advance Received</span>
              </label>
            </div>
          )}

          <div>
            <label className="text-sm font-semibold text-slate-600">Open Balance</label>
            {editing ? (
              <Input
                type="number"
                value={formData.open_balance || ''}
                onChange={(e) => onChange('open_balance', parseFloat(e.target.value))}
                className="text-sm mt-1"
              />
            ) : (
              <p className={`font-bold text-lg ${lead.open_balance > 0 ? 'text-red-700' : 'text-green-700'}`}>
                ${(lead.open_balance || 0).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
