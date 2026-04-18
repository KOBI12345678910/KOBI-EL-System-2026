import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
    CheckCircle2, Clock, ArrowLeft, Users, FileCheck, 
    Hammer, PaintBucket, Truck, Star, AlertTriangle, PlayCircle
} from 'lucide-react';

export default function ProductionFlowVisualizer({ project }) {
    const [expandedStage, setExpandedStage] = useState(null);

    const productionStages = [
        {
            id: 'deal_closed',
            title: 'נסגרה עסקה',
            icon: CheckCircle2,
            color: 'green',
            responsible: 'איש מכירות',
            automation: [
                '✓ שליחת מייל אישור ללקוח',
                '✓ הודעת WhatsApp ללקוח',
                '✓ התראה למנהל פרויקטים',
                '✓ יצירת פרויקט במערכת'
            ]
        },
        {
            id: 'measurement',
            title: 'תיאום מדידות',
            icon: FileCheck,
            color: 'blue',
            responsible: 'מודד',
            automation: [
                '✓ תיאום פגישה אוטומטי ביומן',
                '✓ WhatsApp ללקוח עם פרטי הפגישה',
                '✓ תזכורת 24 שעות לפני',
                '✓ עדכון סטטוס בפרויקט'
            ]
        },
        {
            id: 'materials',
            title: 'הזמנת חומרי גלם',
            icon: Package,
            color: 'yellow',
            responsible: 'מחלקת רכש',
            automation: [
                '✓ יצירת הזמנת רכש אוטומטית',
                '✓ שליחה לספקים מאושרים',
                '✓ התראה כשחומר הגיע למלאי',
                '✓ עדכון מנהל פרויקט'
            ]
        },
        {
            id: 'production_approval',
            title: 'אישור להתחלת ייצור',
            icon: FileCheck,
            color: 'orange',
            responsible: 'מנהל ייצור + מהנדס',
            automation: [
                '✓ בקשת אישור למנהל',
                '✓ בקשת אישור למהנדס',
                '✓ אישור ייצרן',
                '✓ העברה אוטומטית לייצור עם אישור'
            ]
        },
        {
            id: 'production_start',
            title: 'התחלת ייצור',
            icon: PlayCircle,
            color: 'purple',
            responsible: 'ייצרן',
            automation: [
                '✓ יצירת פקודת ייצור',
                '✓ הקצאת עובדים ומכונות',
                '✓ WhatsApp ללקוח - "ייצור החל"',
                '✓ התראה למנהל ייצור'
            ]
        },
        {
            id: 'production_mid',
            title: 'אמצע ייצור',
            icon: Hammer,
            color: 'indigo',
            responsible: 'מנהל ייצור',
            automation: [
                '✓ עדכון אוטומטי על התקדמות',
                '✓ תזכורת בקרת איכות ביניים',
                '✓ דוח סטטוס ללקוח'
            ]
        },
        {
            id: 'production_end',
            title: 'סיום ייצור',
            icon: CheckCircle2,
            color: 'green',
            responsible: 'מנהל ייצור',
            automation: [
                '✓ אישור מנהל ייצור',
                '✓ בקרת איכות מלאה',
                '✓ העברה אוטומטית לצביעה',
                '✓ עדכון ללקוח'
            ]
        },
        {
            id: 'quality_check',
            title: 'פיקוח ובקרת איכות',
            icon: AlertTriangle,
            color: 'red',
            responsible: 'בקר איכות',
            automation: [
                '✓ צ\'קליסט בדיקות אוטומטי',
                '✓ דוח חריגות',
                '✓ חזרה לייצור אם נדרש תיקון',
                '✓ אישור המשך תהליך'
            ]
        },
        {
            id: 'painting',
            title: 'צביעה בתנור',
            icon: PaintBucket,
            color: 'pink',
            responsible: 'מחלקת צביעה',
            automation: [
                '✓ העברה למחלקת צביעה',
                '✓ תזמון תור בתנור',
                '✓ עדכון בסיום צביעה',
                '✓ חזרה למפעל'
            ]
        },
        {
            id: 'ready_installation',
            title: 'מוכן להתקנה',
            icon: CheckCircle2,
            color: 'green',
            responsible: 'מתאם התקנות',
            automation: [
                '✓ WhatsApp ללקוח - "מוכן להתקנה"',
                '✓ תיאום תאריך התקנה',
                '✓ הקצאת מתקין',
                '✓ יומן התקנה'
            ]
        },
        {
            id: 'installation',
            title: 'ביצוע התקנה',
            icon: Truck,
            color: 'blue',
            responsible: 'מתקין',
            automation: [
                '✓ תזכורת למתקין ביום ההתקנה',
                '✓ WhatsApp ללקוח - "בדרך"',
                '✓ אישור מתקין - התקנה הושלמה',
                '✓ העברה לשלב סקר שביעות רצון'
            ]
        },
        {
            id: 'satisfaction',
            title: 'סקר שביעות רצון',
            icon: Star,
            color: 'yellow',
            responsible: 'אוטומטי',
            automation: [
                '✓ שליחת סקר WhatsApp אוטומטי',
                '✓ שיחת מעקב אם לא מילא',
                '✓ רישום תוצאות',
                '✓ סגירת פרויקט או פתיחת תיקון'
            ]
        },
        {
            id: 'completed',
            title: 'פרויקט הושלם בהצלחה',
            icon: CheckCircle2,
            color: 'emerald',
            responsible: 'המערכת',
            automation: [
                '✓ סגירה אוטומטית',
                '✓ דוח רווחיות',
                '✓ העברה לארכיון',
                '✓ ניתוח ביצועים'
            ]
        }
    ];

    const colorClasses = {
        green: 'bg-green-500',
        blue: 'bg-blue-500',
        yellow: 'bg-yellow-500',
        orange: 'bg-orange-500',
        purple: 'bg-purple-500',
        red: 'bg-red-500',
        indigo: 'bg-indigo-500',
        pink: 'bg-pink-500',
        teal: 'bg-teal-500',
        emerald: 'bg-emerald-500'
    };

    return (
        <div className="space-y-8">
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">תהליך שרשרת האספקה המלא</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {productionStages.map((stage, idx) => (
                            <div key={stage.id}>
                                <div 
                                    className="p-4 border-2 rounded-lg hover:shadow-lg transition-all cursor-pointer"
                                    onClick={() => setExpandedStage(expandedStage === stage.id ? null : stage.id)}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className={`w-10 h-10 rounded-full ${colorClasses[stage.color]} flex items-center justify-center text-white font-bold`}>
                                                {idx + 1}
                                            </div>
                                            <div>
                                                <p className="font-semibold text-sm flex items-center gap-2">
                                                    <stage.icon className="w-4 h-4" />
                                                    {stage.title}
                                                </p>
                                                <p className="text-xs text-slate-600">אחראי: {stage.responsible}</p>
                                            </div>
                                        </div>
                                        <Badge className={
                                            stage.color === 'green' || stage.color === 'emerald' ? 'bg-green-100 text-green-800' :
                                            stage.color === 'red' ? 'bg-red-100 text-red-800' :
                                            stage.color === 'purple' || stage.color === 'indigo' ? 'bg-purple-100 text-purple-800' :
                                            'bg-blue-100 text-blue-800'
                                        }>
                                            {stageStats.find(s => s.title.includes(stage.title.split(' ')[0]))?.count || 0} פעילים
                                        </Badge>
                                    </div>

                                    {expandedStage === stage.id && (
                                        <div className="mt-4 p-4 bg-slate-50 rounded-lg">
                                            <p className="text-xs font-semibold mb-2">אוטומציות פעילות:</p>
                                            <div className="space-y-1">
                                                {stage.automation.map((auto, i) => (
                                                    <p key={i} className="text-xs text-slate-700">{auto}</p>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {idx < productionStages.length - 1 && (
                                    <div className="flex justify-center my-2">
                                        <ArrowLeft className="w-5 h-5 text-slate-400" />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {selectedProject && (
                <Card className="border-2 border-indigo-200">
                    <CardHeader>
                        <CardTitle className="text-lg">פרטי פרויקט: {selectedProject.name}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <p className="text-xs text-slate-600">לקוח</p>
                                <p className="font-semibold text-sm">{selectedProject.customer_name}</p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-600">סטטוס</p>
                                <Badge>{selectedProject.status}</Badge>
                            </div>
                            <div>
                                <p className="text-xs text-slate-600">ערך פרויקט</p>
                                <p className="font-semibold text-sm">{selectedProject.deal_value?.toLocaleString()} ₪</p>
                            </div>
                        </div>
                        <div className="flex gap-2 mt-4">
                            <Button size="sm">קדם לשלב הבא</Button>
                            <Button size="sm" variant="outline">הקצה משאבים</Button>
                            <Button size="sm" variant="outline">שלח עדכון ללקוח</Button>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}