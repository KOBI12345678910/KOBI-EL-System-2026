import { useState } from "react";
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { 
    CreditCard, Copy, CheckCircle, ExternalLink, 
    DollarSign, Calendar, User, Receipt 
} from 'lucide-react';
import { toast } from 'sonner';
import { entityUpdate } from "@/lib/entity-api";

export default function OnlinePaymentButton({ invoice }) {
    const [paymentDialog, setPaymentDialog] = useState(false);
    const [paymentLink, setPaymentLink] = useState('');
    const queryClient = useQueryClient();

    const generatePaymentLinkMutation = useMutation({
        mutationFn: async () => {
            // Generate unique payment link
            const link = `https://pay.yourcompany.com/invoice/${invoice.id}?token=${Math.random().toString(36).substr(2, 9)}`;
            
            // Update invoice with payment link
            await entityUpdate<any>("invoices", invoice.id, {
                payment_link: link,
                payment_link_generated_date: new Date().toISOString()
            });
            
            return link;
        },
        onSuccess: (link) => {
            setPaymentLink(link);
            setPaymentDialog(true);
            queryClient.invalidateQueries(['invoices']);
        }
    });

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        toast.success('הקישור הועתק ללוח');
    };

    const sendPaymentLink = async (method) => {
        if (method === 'email') {
            await fetch("/api/integrations/send-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
                to: invoice.customer_email,
                subject: `תשלום עבור חשבונית ${invoice.invoice_number}`,
                body: `
שלום ${invoice.customer_name},

תוכל לשלם את חשבונית מס' ${invoice.invoice_number} בסכום של ₪${invoice.total_amount?.toLocaleString()} דרך הקישור הבא:

${paymentLink}

תודה,
החברה שלנו
                `
            }) });
            toast.success('קישור לתשלום נשלח באימייל');
        } else if (method === 'whatsapp') {
            const message = encodeURIComponent(
                `שלום ${invoice.customer_name}, תוכל לשלם את חשבונית ${invoice.invoice_number} בקישור: ${paymentLink}`
            );
            window.open(`https://wa.me/${invoice.customer_phone?.replace(/[^0-9]/g, '')}?text=${message}`, '_blank');
        }
    };

    return (
        <>
            <Button 
                onClick={() => generatePaymentLinkMutation.mutate()}
                className="gap-2"
                disabled={invoice.status === 'paid'}
            >
                <CreditCard className="w-4 h-4" />
                קישור לתשלום
            </Button>

            <Dialog open={paymentDialog} onOpenChange={setPaymentDialog}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <CreditCard className="w-5 h-5 text-indigo-600" />
                            תשלום מקוון - חשבונית {invoice.invoice_number}
                        </DialogTitle>
                    </DialogHeader>
                    
                    <div className="space-y-6">
                        {/* Invoice Details */}
                        <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg">
                            <div className="flex items-center gap-2">
                                <User className="w-4 h-4 text-slate-500" />
                                <div>
                                    <p className="text-xs text-slate-500">לקוח</p>
                                    <p className="font-semibold">{invoice.customer_name}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <DollarSign className="w-4 h-4 text-slate-500" />
                                <div>
                                    <p className="text-xs text-slate-500">סכום</p>
                                    <p className="font-semibold">₪{invoice.total_amount?.toLocaleString()}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Receipt className="w-4 h-4 text-slate-500" />
                                <div>
                                    <p className="text-xs text-slate-500">מספר חשבונית</p>
                                    <p className="font-semibold">{invoice.invoice_number}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-slate-500" />
                                <div>
                                    <p className="text-xs text-slate-500">תאריך פירעון</p>
                                    <p className="font-semibold">
                                        {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('he-IL') : 'לא צוין'}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Payment Link */}
                        <div>
                            <label className="text-sm font-semibold mb-2 block">קישור לתשלום</label>
                            <div className="flex gap-2">
                                <div className="flex-1 p-3 bg-slate-100 rounded-lg font-mono text-sm break-all">
                                    {paymentLink}
                                </div>
                                <Button 
                                    variant="outline" 
                                    size="icon"
                                    onClick={() => copyToClipboard(paymentLink)}
                                >
                                    <Copy className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>

                        {/* Payment Methods */}
                        <div>
                            <label className="text-sm font-semibold mb-3 block">אפשרויות תשלום</label>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="p-4 border-2 border-indigo-200 rounded-xl bg-indigo-50">
                                    <div className="text-3xl mb-2">💳</div>
                                    <p className="font-semibold text-sm">אשראי / חיוב</p>
                                    <Badge className="mt-2 bg-indigo-100 text-indigo-700">זמין</Badge>
                                </div>
                                <div className="p-4 border-2 border-blue-200 rounded-xl bg-blue-50">
                                    <div className="text-3xl mb-2">🅿️</div>
                                    <p className="font-semibold text-sm">PayPal</p>
                                    <Badge className="mt-2 bg-blue-100 text-blue-700">זמין</Badge>
                                </div>
                                <div className="p-4 border-2 border-green-200 rounded-xl bg-green-50">
                                    <div className="text-3xl mb-2">📱</div>
                                    <p className="font-semibold text-sm">Bit</p>
                                    <Badge className="mt-2 bg-green-100 text-green-700">זמין</Badge>
                                </div>
                            </div>
                        </div>

                        {/* Send Options */}
                        <div className="flex gap-2">
                            <Button 
                                onClick={() => sendPaymentLink('email')}
                                className="flex-1 gap-2"
                                variant="outline"
                            >
                                📧 שלח באימייל
                            </Button>
                            <Button 
                                onClick={() => sendPaymentLink('whatsapp')}
                                className="flex-1 gap-2"
                                variant="outline"
                            >
                                💬 שלח ב-WhatsApp
                            </Button>
                            <Button 
                                onClick={() => window.open(paymentLink, '_blank')}
                                className="gap-2"
                            >
                                <ExternalLink className="w-4 h-4" />
                                פתח
                            </Button>
                        </div>

                        {/* Info */}
                        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                            <div className="flex items-start gap-2">
                                <CheckCircle className="w-5 h-5 text-blue-600 mt-0.5" />
                                <div className="text-sm text-blue-900">
                                    <p className="font-semibold mb-1">תשלום מאובטח</p>
                                    <p className="text-blue-700">
                                        הקישור מאובטח ומוצפן. הלקוח יכול לשלם בכרטיס אשראי, PayPal או Bit.
                                        לאחר התשלום, החשבונית תתעדכן אוטומטית למצב "שולם".
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}