import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Zap, MessageCircle, Mail, Bell, Calendar } from 'lucide-react';

export default function AutomationManager() {
    const automations = [
        {
            category: 'WhatsApp אוטומטי',
            icon: MessageCircle,
            items: [
                { name: 'אישור עסקה ללקוח', enabled: true, trigger: 'סגירת עסקה' },
                { name: 'עדכון תיאום מדידה', enabled: true, trigger: 'תזמון מדידה' },
                { name: 'התחלת ייצור', enabled: true, trigger: 'אישור ייצור' },
                { name: 'מוכן להתקנה', enabled: true, trigger: 'סיום צביעה' },
                { name: 'בדרך להתקנה', enabled: true, trigger: 'יציאת מתקין' },
                { name: 'סקר שביעות רצון', enabled: true, trigger: 'סיום התקנה' },
                { name: 'תזכורות פגישות', enabled: true, trigger: '24 שעות לפני' }
            ]
        },
        {
            category: 'מיילים אוטומטיים',
            icon: Mail,
            items: [
                { name: 'הצעת מחיר ללקוח', enabled: true, trigger: 'יצירת הצעת מחיר' },
                { name: 'חשבונית ללקוח', enabled: true, trigger: 'סגירת פרויקט' },
                { name: 'דוח חודשי לרו"ח', enabled: true, trigger: 'כל 1 בחודש' },
                { name: 'דוח ניהולי למנכ"ל', enabled: true, trigger: 'יום ראשון 08:00' }
            ]
        },
        {
            category: 'התראות פנימיות',
            icon: Bell,
            items: [
                { name: 'ליד חדש נכנס', enabled: true, trigger: 'יצירת ליד' },
                { name: 'עסקה נסגרה', enabled: true, trigger: 'עדכון עסקה לסגור' },
                { name: 'חריגה בזמן ייצור', enabled: true, trigger: 'עיכוב >3 ימים' },
                { name: 'בעיית איכות', enabled: true, trigger: 'כשל בבקרת איכות' },
                { name: 'חומר גלם חסר', enabled: true, trigger: 'מלאי נמוך' }
            ]
        },
        {
            category: 'יומן ותזכורות',
            icon: Calendar,
            items: [
                { name: 'תיאום מדידות אוטומטי', enabled: true, trigger: 'אחרי סגירת עסקה' },
                { name: 'תיאום התקנה', enabled: true, trigger: 'סיום צביעה' },
                { name: 'תזכורות לעובדים', enabled: true, trigger: 'בוקר יום הפגישה' },
                { name: 'סנכרון ל-Google Calendar', enabled: false, trigger: 'כל פגישה' }
            ]
        },
        {
            category: 'אישורים דיגיטליים',
            icon: FileCheck,
            items: [
                { name: 'אישור מנהל להתחלת ייצור', enabled: true, trigger: 'הזמנת חומרים הושלמה' },
                { name: 'אישור מהנדס לתכנון', enabled: true, trigger: 'אחרי מדידות' },
                { name: 'אישור ייצרן לביצוע', enabled: true, trigger: 'אחרי אישור מנהל' },
                { name: 'אישור בקר איכות', enabled: true, trigger: 'סיום ייצור' },
                { name: 'אישור מתקין על התקנה', enabled: true, trigger: 'סיום התקנה' }
            ]
        }
    ];

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Zap className="w-5 h-5 text-yellow-600" />
                            ניהול אוטומציות
                        </CardTitle>
                        <Button variant="outline" size="sm">+ אוטומציה חדשה</Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="space-y-6">
                        {automations.map((category) => (
                            <div key={category.category}>
                                <div className="flex items-center gap-2 mb-3">
                                    <category.icon className="w-5 h-5 text-indigo-600" />
                                    <h3 className="font-semibold text-sm">{category.category}</h3>
                                    <Badge variant="outline" className="mr-auto">
                                        {category.items.filter(i => i.enabled).length}/{category.items.length} פעילות
                                    </Badge>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {category.items.map((item) => (
                                        <div key={item.name} className="p-3 border rounded-lg">
                                            <div className="flex items-start justify-between mb-1">
                                                <div className="flex-1">
                                                    <p className="text-sm font-medium">{item.name}</p>
                                                    <p className="text-xs text-slate-600">טריגר: {item.trigger}</p>
                                                </div>
                                                <Switch defaultChecked={item.enabled} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">סטטיסטיקות אוטומציה</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-sm">הרצות היום</span>
                                <span className="font-bold text-lg">247</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm">הודעות WhatsApp</span>
                                <span className="font-bold text-lg">83</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm">מיילים שנשלחו</span>
                                <span className="font-bold text-lg">42</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm">אישורים שנשלחו</span>
                                <span className="font-bold text-lg">15</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">חיבור WhatsApp Business</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="p-3 bg-green-50 border border-green-200 rounded-lg mb-3">
                            <p className="text-sm font-medium text-green-800">✓ מחובר ופעיל</p>
                            <p className="text-xs text-green-600 mt-1">+972-XX-XXX-XXXX</p>
                        </div>
                        <Button variant="outline" className="w-full">הגדרות WhatsApp</Button>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">חתימות דיגיטליות</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span>חוזים חתומים החודש</span>
                                <span className="font-semibold">12</span>
                            </div>
                            <div className="flex justify-between">
                                <span>ממתינים לחתימה</span>
                                <span className="font-semibold">3</span>
                            </div>
                        </div>
                        <Button variant="outline" className="w-full mt-3">נהל חתימות</Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}