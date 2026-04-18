import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Mail, Phone, FileText, DollarSign, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { entityFilter } from "@/lib/entity-api";

export default function CustomerInteractionHistory({ customerId, customerEmail }) {
    const { data: reminders = [] } = useQuery({
        queryKey: ['reminders', customerId],
        queryFn: () => entityFilter<any>("reminder-logs", { customer_id: customerId }),
    });

    const { data: documents = [] } = useQuery({
        queryKey: ['documents', customerId],
        queryFn: () => entityFilter<any>("document-sends", { customer_id: customerId }),
    });

    const { data: invoices = [] } = useQuery({
        queryKey: ['invoices', customerId],
        queryFn: () => entityFilter<any>("invoices", { customer_id: customerId }),
    });

    // סדר את כל האינטראקציות לפי תאריך
    const allInteractions = [
        ...reminders.map(r => ({ type: 'reminder', data: r, date: r.scheduled_for })),
        ...documents.map(d => ({ type: 'document', data: d, date: d.sent_at || d.created_date })),
        ...invoices.map(i => ({ type: 'invoice', data: i, date: i.issue_date })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    const getIcon = (type) => {
        switch(type) {
            case 'reminder': return <Clock className="w-4 h-4" />;
            case 'document': return <FileText className="w-4 h-4" />;
            case 'invoice': return <DollarSign className="w-4 h-4" />;
            default: return <Mail className="w-4 h-4" />;
        }
    };

    const getColor = (type) => {
        switch(type) {
            case 'reminder': return 'bg-yellow-50 border-yellow-200';
            case 'document': return 'bg-blue-50 border-blue-200';
            case 'invoice': return 'bg-green-50 border-green-200';
            default: return 'bg-slate-50 border-slate-200';
        }
    };

    const getStatusBadge = (interaction) => {
        if (interaction.type === 'reminder') {
            const statusColors = {
                pending: 'bg-yellow-100 text-yellow-800',
                sent: 'bg-blue-100 text-blue-800',
                completed: 'bg-green-100 text-green-800',
                overdue: 'bg-red-100 text-red-800',
            };
            return <Badge className={statusColors[interaction.data.status] || 'bg-slate-100'}>{interaction.data.status}</Badge>;
        }
        if (interaction.type === 'document') {
            return interaction.data.opened ? 
                <Badge className="bg-green-100 text-green-800">✓ נפתח</Badge> :
                <Badge className="bg-slate-100 text-slate-800">לא נפתח</Badge>;
        }
        if (interaction.type === 'invoice') {
            const statusColors = {
                paid: 'bg-green-100 text-green-800',
                partial: 'bg-yellow-100 text-yellow-800',
                overdue: 'bg-red-100 text-red-800',
                draft: 'bg-slate-100 text-slate-800',
            };
            return <Badge className={statusColors[interaction.data.status] || 'bg-slate-100'}>{interaction.data.status}</Badge>;
        }
    };

    return (
        <div className="space-y-3">
            {allInteractions.length === 0 ? (
                <p className="text-center text-slate-500 py-8">אין אינטראקציות עדיין</p>
            ) : (
                allInteractions.map((interaction, idx) => (
                    <div
                        key={idx}
                        className={`p-4 border rounded-lg ${getColor(interaction.type)}`}
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3 flex-1">
                                <div className="mt-1 text-slate-500">
                                    {getIcon(interaction.type)}
                                </div>
                                <div className="flex-1">
                                    {interaction.type === 'reminder' && (
                                        <>
                                            <p className="font-semibold text-sm">תזכורת: {interaction.data.reminder_title}</p>
                                            <p className="text-xs text-slate-600 mt-1">{interaction.data.reminder_description}</p>
                                            <p className="text-xs text-slate-500 mt-2">
                                                {new Date(interaction.date).toLocaleString('he-IL')}
                                            </p>
                                        </>
                                    )}
                                    {interaction.type === 'document' && (
                                        <>
                                            <p className="font-semibold text-sm">{interaction.data.document_type}: {interaction.data.document_name}</p>
                                            <p className="text-xs text-slate-600 mt-1">אל: {interaction.data.recipient_email}</p>
                                            <p className="text-xs text-slate-500 mt-2">
                                                {interaction.data.sent_at ? new Date(interaction.data.sent_at).toLocaleString('he-IL') : 'בהכנה'}
                                            </p>
                                        </>
                                    )}
                                    {interaction.type === 'invoice' && (
                                        <>
                                            <p className="font-semibold text-sm">חשבונית #{interaction.data.invoice_number}</p>
                                            <p className="text-xs text-slate-600 mt-1">
                                                סכום: ₪{interaction.data.total?.toLocaleString()}
                                            </p>
                                            <p className="text-xs text-slate-500 mt-2">
                                                {new Date(interaction.date).toLocaleString('he-IL')}
                                            </p>
                                        </>
                                    )}
                                </div>
                            </div>
                            <div>
                                {getStatusBadge(interaction)}
                            </div>
                        </div>
                    </div>
                ))
            )}
        </div>
    );
}