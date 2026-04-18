import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Circle, ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';

export default function QuoteToCashFlow({ quote, order, invoice, payments = [] }) {
    const steps = [
        {
            label: 'הצעת מחיר',
            status: quote ? 'completed' : 'pending',
            date: quote?.created_date,
            amount: quote?.total,
            details: quote ? `${quote.quote_number} - ${quote.status}` : null
        },
        {
            label: 'הזמנה',
            status: order ? 'completed' : quote?.status === 'accepted' ? 'pending' : 'disabled',
            date: order?.created_date,
            amount: order?.total,
            details: order ? `${order.order_number} - ${order.status}` : null
        },
        {
            label: 'חשבונית',
            status: invoice ? 'completed' : order ? 'pending' : 'disabled',
            date: invoice?.issue_date,
            amount: invoice?.total,
            details: invoice ? `${invoice.invoice_number} - ${invoice.status}` : null
        },
        {
            label: 'תשלום',
            status: payments.length > 0 ? 'completed' : invoice ? 'pending' : 'disabled',
            date: payments[0]?.payment_date,
            amount: payments.reduce((sum, p) => sum + (p.amount || 0), 0),
            details: payments.length > 0 ? `${payments.length} תשלומים` : null
        }
    ];

    const getStatusColor = (status) => {
        switch (status) {
            case 'completed': return 'bg-emerald-500';
            case 'pending': return 'bg-amber-500';
            default: return 'bg-slate-300';
        }
    };

    return (
        <Card>
            <CardContent className="p-6">
                <h3 className="font-semibold mb-4">תהליך Quote to Cash</h3>
                <div className="flex items-center justify-between">
                    {steps.map((step, idx) => (
                        <React.Fragment key={idx}>
                            <div className="flex flex-col items-center gap-2 flex-1">
                                <div className={`w-12 h-12 rounded-full ${getStatusColor(step.status)} flex items-center justify-center`}>
                                    {step.status === 'completed' ? (
                                        <CheckCircle className="w-6 h-6 text-white" />
                                    ) : (
                                        <Circle className="w-6 h-6 text-white" />
                                    )}
                                </div>
                                <p className="text-sm font-medium text-center">{step.label}</p>
                                {step.details && (
                                    <Badge variant="outline" className="text-xs">{step.details}</Badge>
                                )}
                                {step.date && (
                                    <p className="text-xs text-slate-400">{format(new Date(step.date), 'dd/MM/yy')}</p>
                                )}
                                {step.amount > 0 && (
                                    <p className="text-sm font-semibold">₪{step.amount.toLocaleString()}</p>
                                )}
                            </div>
                            {idx < steps.length - 1 && (
                                <ArrowLeft className="w-6 h-6 text-slate-400 -mt-8" />
                            )}
                        </React.Fragment>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}