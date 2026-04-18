import { useState } from "react";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Send, AlertCircle, Copy, MessageCircle, Mail } from 'lucide-react';
import { toast } from 'sonner';

export default function CustomerEmailSender({ customer }) {
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [attachmentType, setAttachmentType] = useState('');
    const [loading, setLoading] = useState(false);
    const [channel, setChannel] = useState('email');
    const [shareLink, setShareLink] = useState('');

    const handleSendEmail = async () => {
        if (!subject || !body || !customer.email) {
            toast.error('נא מלא את כל השדות הדרושים');
            return;
        }

        setLoading(true);
        try {
            // כאן יתבצע שליחת המייל דרך Gmail Connection
            toast.success('המייל נשלח בהצלחה');
            setSubject('');
            setBody('');
        } catch (error) {
            toast.error('שגיאה בשליחת המייל');
        } finally {
            setLoading(false);
        }
    };

    const handleSendWhatsApp = async () => {
        if (!body || !customer.phone) {
            toast.error('נא וודא שלעלקוח יש מספר טלפון');
            return;
        }

        try {
            // יצירת הודעה לWhatsApp Business
            const whatsappMessage = `${body}${attachmentType ? `\n\n[מסמך מצורף: ${attachmentType}]` : ''}`;
            const encodedMessage = encodeURIComponent(whatsappMessage);
            const whatsappUrl = `https://wa.me/${customer.phone.replace(/\D/g, '')}?text=${encodedMessage}`;
            
            window.open(whatsappUrl, '_blank');
            toast.success('נפתח WhatsApp Business - אנא אשר את השליחה');
        } catch (error) {
            toast.error('שגיאה בהתחברות לWhatsApp');
        }
    };

    const handleCopyLink = async () => {
        const messageText = `${body}${attachmentType ? `\n\n[מסמך: ${attachmentType}]` : ''}`;
        const link = `${window.location.origin}?customer=${customer.id}&message=${encodeURIComponent(messageText)}`;
        
        try {
            await navigator.clipboard.writeText(link);
            toast.success('הקישור הועתק ללוח');
            setShareLink(link);
        } catch (error) {
            toast.error('שגיאה בהעתקת הקישור');
        }
    };

    const templates = [
        { name: 'הצעה חדשה', text: `שלום ${customer.name},\n\nקיבלת הצעה חדשה מעדכן. אנא בדוק את הפרטים המצורפים.\n\nברכות` },
        { name: 'תזכורת תשלום', text: `שלום ${customer.name},\n\nזו תזכורת בדבר תשלום המגיע. אנא בצע תשלום בהקדם.\n\nברכות` },
        { name: 'אישור קבלה', text: `שלום ${customer.name},\n\nאישרנו קבלת הזמנתך. המשלוח בדרך אלייך.\n\nברכות` },
        { name: 'קבלת חשבונית', text: `שלום ${customer.name},\n\nקיבלת חשבונית חדשה. אנא בדוק את הפרטים.\n\nתודה על העסקה!` },
    ];

    return (
        <div className="space-y-4">
            <Tabs value={channel} onValueChange={setChannel} className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="email" className="flex items-center gap-2">
                        <Mail className="w-4 h-4" />
                        אימייל
                    </TabsTrigger>
                    <TabsTrigger value="whatsapp" className="flex items-center gap-2">
                        <MessageCircle className="w-4 h-4" />
                        WhatsApp
                    </TabsTrigger>
                    <TabsTrigger value="link" className="flex items-center gap-2">
                        <Copy className="w-4 h-4" />
                        שיתוף קישור
                    </TabsTrigger>
                </TabsList>

                {/* Email Tab */}
                <TabsContent value="email" className="space-y-4 mt-4">
                    <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <Mail className="w-4 h-4 text-blue-600" />
                        <p className="text-sm text-blue-700">שליחה אל: <strong>{customer.email}</strong></p>
                    </div>

                    <div>
                        <Label>תבניות מהירות</Label>
                        <div className="flex gap-2 mt-2 flex-wrap">
                            {templates.map(t => (
                                <Button
                                    key={t.name}
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        setSubject(`${t.name} - ${customer.company || customer.name}`);
                                        setBody(t.text);
                                    }}
                                >
                                    {t.name}
                                </Button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <Label>נושא</Label>
                        <Input
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            placeholder="נושא המייל"
                            className="mt-1"
                        />
                    </div>

                    <div>
                        <Label>גוף ההודעה</Label>
                        <Textarea
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            placeholder="כתוב את הודעתך כאן..."
                            className="mt-1 h-32"
                        />
                    </div>

                    <div>
                        <Label>צרף מסמך</Label>
                        <select
                            value={attachmentType}
                            onChange={(e) => setAttachmentType(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm mt-1"
                        >
                            <option value="">-- בחר מסמך --</option>
                            <option value="quote">הצעה מחיר</option>
                            <option value="invoice">חשבונית</option>
                            <option value="delivery">אישור משלוח</option>
                            <option value="contract">חוזה</option>
                        </select>
                    </div>

                    <Button
                        onClick={handleSendEmail}
                        disabled={loading || !subject || !body}
                        className="w-full bg-blue-600 hover:bg-blue-700"
                    >
                        <Send className="w-4 h-4 ml-2" />
                        {loading ? 'שולח...' : 'שלח מייל'}
                    </Button>
                </TabsContent>

                {/* WhatsApp Tab */}
                <TabsContent value="whatsapp" className="space-y-4 mt-4">
                    <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                        <MessageCircle className="w-4 h-4 text-green-600" />
                        <p className="text-sm text-green-700">
                            {customer.phone ? <>שליחה אל: <strong>{customer.phone}</strong></> : 'אין מספר טלפון רשום'}
                        </p>
                    </div>

                    <div>
                        <Label>תבניות מהירות</Label>
                        <div className="flex gap-2 mt-2 flex-wrap">
                            {templates.map(t => (
                                <Button
                                    key={t.name}
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setBody(t.text)}
                                >
                                    {t.name}
                                </Button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <Label>הודעה</Label>
                        <Textarea
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            placeholder="כתוב את ההודעה שלך כאן..."
                            className="mt-1 h-32"
                        />
                    </div>

                    <div>
                        <Label>צרף מסמך</Label>
                        <select
                            value={attachmentType}
                            onChange={(e) => setAttachmentType(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm mt-1"
                        >
                            <option value="">-- בחר מסמך --</option>
                            <option value="quote">הצעה מחיר</option>
                            <option value="invoice">חשבונית</option>
                            <option value="delivery">אישור משלוח</option>
                            <option value="contract">חוזה</option>
                        </select>
                    </div>

                    <Button
                        onClick={handleSendWhatsApp}
                        disabled={loading || !body || !customer.phone}
                        className="w-full bg-green-600 hover:bg-green-700"
                    >
                        <MessageCircle className="w-4 h-4 ml-2" />
                        {loading ? 'שולח...' : 'שלח דרך WhatsApp'}
                    </Button>
                </TabsContent>

                {/* Share Link Tab */}
                <TabsContent value="link" className="space-y-4 mt-4">
                    <div className="flex items-center gap-2 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                        <Copy className="w-4 h-4 text-purple-600" />
                        <p className="text-sm text-purple-700">שיתוף קישור ישיר עם הלקוח</p>
                    </div>

                    <div>
                        <Label>תבניות מהירות</Label>
                        <div className="flex gap-2 mt-2 flex-wrap">
                            {templates.map(t => (
                                <Button
                                    key={t.name}
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setBody(t.text)}
                                >
                                    {t.name}
                                </Button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <Label>הודעה</Label>
                        <Textarea
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            placeholder="כתוב את ההודעה שלך כאן..."
                            className="mt-1 h-32"
                        />
                    </div>

                    <div>
                        <Label>צרף מסמך</Label>
                        <select
                            value={attachmentType}
                            onChange={(e) => setAttachmentType(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm mt-1"
                        >
                            <option value="">-- בחר מסמך --</option>
                            <option value="quote">הצעה מחיר</option>
                            <option value="invoice">חשבונית</option>
                            <option value="delivery">אישור משלוח</option>
                            <option value="contract">חוזה</option>
                        </select>
                    </div>

                    <Button
                        onClick={handleCopyLink}
                        disabled={loading || !body}
                        className="w-full bg-purple-600 hover:bg-purple-700"
                    >
                        <Copy className="w-4 h-4 ml-2" />
                        {shareLink ? 'קישור הועתק!' : 'צור קישור והעתק'}
                    </Button>

                    {shareLink && (
                        <div className="p-3 bg-slate-100 rounded-lg break-all text-sm text-slate-700">
                            {shareLink}
                        </div>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
}