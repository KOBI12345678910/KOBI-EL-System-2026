import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Clock, DollarSign, CheckCircle, Send } from 'lucide-react';
import { format } from 'date-fns';
import { entityList } from "@/lib/entity-api";

export default function CollectionsDashboard() {
    const { data: invoices = [] } = useQuery({ 
        queryKey: ['invoices-collections'], 
        queryFn: () => entityList<any>("invoices", '-created_date') 
    });

    const now = new Date();
    const overdueInvoices = invoices.filter(inv => {
        if (!inv.due_date || inv.status === 'paid') return false;
        return new Date(inv.due_date) < now && inv.balance_due > 0;
    });

    const dueSoonInvoices = invoices.filter(inv => {
        if (!inv.due_date || inv.status === 'paid') return false;
        const dueDate = new Date(inv.due_date);
        const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
        return daysUntilDue > 0 && daysUntilDue <= 7 && inv.balance_due > 0;
    });

    const totalOverdue = overdueInvoices.reduce((sum, inv) => sum + (inv.balance_due || 0), 0);
    const totalDueSoon = dueSoonInvoices.reduce((sum, inv) => sum + (inv.balance_due || 0), 0);

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="border-red-200 bg-red-50">
                    <CardContent className="p-6">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-red-100 rounded-xl">
                                <AlertTriangle className="w-6 h-6 text-red-600" />
                            </div>
                            <div className="flex-1">
                                <p className="text-sm text-red-700">חשבוניות באיחור</p>
                                <p className="text-2xl font-bold text-red-600">{overdueInvoices.length}</p>
                                <p className="text-sm text-red-700">₪{totalOverdue.toLocaleString()}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-amber-200 bg-amber-50">
                    <CardContent className="p-6">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-amber-100 rounded-xl">
                                <Clock className="w-6 h-6 text-amber-600" />
                            </div>
                            <div className="flex-1">
                                <p className="text-sm text-amber-700">מגיעות ב-7 ימים</p>
                                <p className="text-2xl font-bold text-amber-600">{dueSoonInvoices.length}</p>
                                <p className="text-sm text-amber-700">₪{totalDueSoon.toLocaleString()}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-emerald-200 bg-emerald-50">
                    <CardContent className="p-6">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-emerald-100 rounded-xl">
                                <CheckCircle className="w-6 h-6 text-emerald-600" />
                            </div>
                            <div className="flex-1">
                                <p className="text-sm text-emerald-700">שולמו החודש</p>
                                <p className="text-2xl font-bold text-emerald-600">
                                    {invoices.filter(i => i.status === 'paid').length}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-red-600" />
                        חשבוניות דורשות טיפול
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {overdueInvoices.slice(0, 10).map(invoice => {
                            const daysOverdue = Math.ceil((now - new Date(invoice.due_date)) / (1000 * 60 * 60 * 24));
                            return (
                                <div key={invoice.id} className="flex items-center justify-between p-4 bg-red-50 rounded-lg border border-red-200">
                                    <div className="flex-1">
                                        <p className="font-medium">{invoice.invoice_number}</p>
                                        <p className="text-sm text-slate-600">{invoice.customer_name}</p>
                                        <p className="text-xs text-red-600 mt-1">{daysOverdue} ימי איחור</p>
                                    </div>
                                    <div className="text-left ml-4">
                                        <p className="text-lg font-bold text-red-600">₪{(invoice.balance_due || 0).toLocaleString()}</p>
                                        <p className="text-xs text-slate-500">
                                            {invoice.due_date && format(new Date(invoice.due_date), 'dd/MM/yy')}
                                        </p>
                                    </div>
                                    <Button size="sm" variant="outline" className="mr-2">
                                        <Send className="w-4 h-4 ml-1" />
                                        שלח תזכורת
                                    </Button>
                                </div>
                            );
                        })}
                        {overdueInvoices.length === 0 && (
                            <p className="text-center py-8 text-slate-400">אין חשבוניות באיחור 🎉</p>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}