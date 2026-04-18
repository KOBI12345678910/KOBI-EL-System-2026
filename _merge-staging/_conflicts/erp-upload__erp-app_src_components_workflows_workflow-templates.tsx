import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Play } from 'lucide-react';

const templates = [
    // Sales (10)
    { name: 'שיוך אוטומטי של הצעות מחיר', category: 'sales', trigger: { type: 'record_created', entity: 'Quote' }, actions: [{ type: 'assign', config: { to: 'sales_team' } }] },
    { name: 'התראה על הזמנה גדולה', category: 'sales', trigger: { type: 'record_created', entity: 'SalesOrder' }, conditions: [{ field: 'total', operator: 'gt', value: '50000' }], actions: [{ type: 'send_notification', config: { to: 'manager' } }] },
    { name: 'אישור הנחה מעל 20%', category: 'sales', trigger: { type: 'record_updated', entity: 'Quote' }, conditions: [{ field: 'discount', operator: 'gt', value: '20' }], actions: [{ type: 'create_approval', config: { approver: 'sales_manager' } }] },
    { name: 'מעקב אחרי הצעת מחיר שנשלחה', category: 'sales', trigger: { type: 'stage_changed', entity: 'Quote' }, conditions: [{ field: 'status', operator: 'equals', value: 'sent' }], actions: [{ type: 'send_notification', config: { delay: '2_days' } }] },
    { name: 'המרת הצעה להזמנה', category: 'sales', trigger: { type: 'stage_changed', entity: 'Quote' }, conditions: [{ field: 'status', operator: 'equals', value: 'accepted' }], actions: [{ type: 'create_record', config: { entity: 'SalesOrder' } }] },
    { name: 'שליחת תודה ללקוח חדש', category: 'sales', trigger: { type: 'record_created', entity: 'Customer' }, actions: [{ type: 'send_email', config: { template: 'welcome' } }] },
    { name: 'התראת איחור במענה ללקוח', category: 'sales', trigger: { type: 'sla_timer', entity: 'Lead' }, conditions: [{ field: 'status', operator: 'equals', value: 'new' }], actions: [{ type: 'send_notification', config: { to: 'sales_rep' } }] },
    { name: 'עדכון סטטוס ליד ללקוח', category: 'sales', trigger: { type: 'record_created', entity: 'SalesOrder' }, actions: [{ type: 'update_record', config: { entity: 'Lead', field: 'status', value: 'won' } }] },
    { name: 'התראה על הזמנה דחופה', category: 'sales', trigger: { type: 'record_created', entity: 'SalesOrder' }, conditions: [{ field: 'priority', operator: 'equals', value: 'urgent' }], actions: [{ type: 'send_notification', config: { to: 'production_manager' } }] },
    { name: 'יצירת משימת מדידה', category: 'sales', trigger: { type: 'stage_changed', entity: 'SalesOrder' }, conditions: [{ field: 'status', operator: 'equals', value: 'confirmed' }], actions: [{ type: 'create_record', config: { entity: 'Task', type: 'measurement' } }] },
    
    // Production (10)
    { name: 'יצירת פקודת ייצור מהזמנה', category: 'production', trigger: { type: 'stage_changed', entity: 'SalesOrder' }, conditions: [{ field: 'status', operator: 'equals', value: 'confirmed' }], actions: [{ type: 'create_record', config: { entity: 'ProductionOrder' } }] },
    { name: 'שיוך פקודה למנהל ייצור', category: 'production', trigger: { type: 'record_created', entity: 'ProductionOrder' }, actions: [{ type: 'assign', config: { to: 'production_manager' } }] },
    { name: 'התראה על עיכוב בייצור', category: 'production', trigger: { type: 'sla_timer', entity: 'ProductionOrder' }, conditions: [{ field: 'status', operator: 'not_equals', value: 'completed' }], actions: [{ type: 'send_notification', config: { to: 'manager' } }] },
    { name: 'העברה אוטומטית לשלב QC', category: 'production', trigger: { type: 'stage_changed', entity: 'ProductionOrder' }, conditions: [{ field: 'current_stage', operator: 'equals', value: 'packaging' }], actions: [{ type: 'update_record', config: { field: 'status', value: 'qc' } }] },
    { name: 'שריפת חומרים מהמלאי', category: 'production', trigger: { type: 'stage_changed', entity: 'ProductionOrder' }, conditions: [{ field: 'status', operator: 'equals', value: 'in_progress' }], actions: [{ type: 'create_record', config: { entity: 'MaterialReservation' } }] },
    { name: 'התראה על עבודה ממושכת', category: 'production', trigger: { type: 'record_updated', entity: 'ProductionOrder' }, conditions: [{ field: 'actual_hours', operator: 'gt', value: 'estimated_hours' }], actions: [{ type: 'send_notification', config: { to: 'production_manager' } }] },
    { name: 'יצירת דוח QC', category: 'production', trigger: { type: 'stage_changed', entity: 'ProductionOrder' }, conditions: [{ field: 'status', operator: 'equals', value: 'qc' }], actions: [{ type: 'create_record', config: { entity: 'QCCheckpoint' } }] },
    { name: 'עדכון הזמנת מכירה בסיום', category: 'production', trigger: { type: 'stage_changed', entity: 'ProductionOrder' }, conditions: [{ field: 'status', operator: 'equals', value: 'completed' }], actions: [{ type: 'update_record', config: { entity: 'SalesOrder', field: 'status', value: 'ready' } }] },
    { name: 'התראת סטייה בעלויות', category: 'production', trigger: { type: 'record_updated', entity: 'ProductionOrder' }, conditions: [{ field: 'materials_cost', operator: 'gt', value: 'budget' }], actions: [{ type: 'send_notification', config: { to: 'finance' } }] },
    { name: 'תזמון התקנה אוטומטי', category: 'production', trigger: { type: 'stage_changed', entity: 'ProductionOrder' }, conditions: [{ field: 'qc_approved', operator: 'equals', value: 'true' }], actions: [{ type: 'create_record', config: { entity: 'Installation' } }] },
    
    // Inventory (8)
    { name: 'התראת מלאי נמוך', category: 'inventory', trigger: { type: 'record_updated', entity: 'Product' }, conditions: [{ field: 'quantity_in_stock', operator: 'lt', value: 'min_stock_level' }], actions: [{ type: 'send_notification', config: { to: 'procurement' } }] },
    { name: 'יצירת הזמנת רכש אוטומטית', category: 'inventory', trigger: { type: 'record_updated', entity: 'Product' }, conditions: [{ field: 'quantity_in_stock', operator: 'lt', value: '10' }], actions: [{ type: 'create_record', config: { entity: 'PurchaseOrder' } }] },
    { name: 'עדכון מלאי בקבלת סחורה', category: 'inventory', trigger: { type: 'record_created', entity: 'GoodsReceipt' }, actions: [{ type: 'update_record', config: { entity: 'Product', field: 'quantity_in_stock' } }] },
    { name: 'התראה על מלאי יתר', category: 'inventory', trigger: { type: 'record_updated', entity: 'Product' }, conditions: [{ field: 'quantity_in_stock', operator: 'gt', value: '1000' }], actions: [{ type: 'send_notification', config: { to: 'warehouse' } }] },
    { name: 'רישום תנועת מלאי', category: 'inventory', trigger: { type: 'record_updated', entity: 'Product' }, actions: [{ type: 'create_record', config: { entity: 'StockMovement' } }] },
    { name: 'התראת פג תוקף', category: 'inventory', trigger: { type: 'scheduled', schedule: 'daily' }, actions: [{ type: 'send_notification', config: { to: 'warehouse', subject: 'check_expiry' } }] },
    { name: 'ספירת מלאי תקופתית', category: 'inventory', trigger: { type: 'scheduled', schedule: 'monthly' }, actions: [{ type: 'create_record', config: { entity: 'Task', type: 'inventory_count' } }] },
    { name: 'התראת סטטוס פריט לא פעיל', category: 'inventory', trigger: { type: 'record_updated', entity: 'Product' }, conditions: [{ field: 'is_active', operator: 'equals', value: 'false' }], actions: [{ type: 'send_notification', config: { to: 'procurement' } }] },
    
    // Finance (8)
    { name: 'יצירת חשבונית מהזמנה', category: 'finance', trigger: { type: 'stage_changed', entity: 'SalesOrder' }, conditions: [{ field: 'status', operator: 'equals', value: 'delivered' }], actions: [{ type: 'create_record', config: { entity: 'Invoice' } }] },
    { name: 'תזכורת תשלום', category: 'finance', trigger: { type: 'sla_timer', entity: 'Invoice' }, conditions: [{ field: 'status', operator: 'equals', value: 'sent' }], actions: [{ type: 'send_email', config: { template: 'payment_reminder' } }] },
    { name: 'התראת חשבונית באיחור', category: 'finance', trigger: { type: 'record_updated', entity: 'Invoice' }, conditions: [{ field: 'status', operator: 'equals', value: 'overdue' }], actions: [{ type: 'send_notification', config: { to: 'finance_manager' } }] },
    { name: 'רישום תשלום בספרים', category: 'finance', trigger: { type: 'stage_changed', entity: 'Invoice' }, conditions: [{ field: 'status', operator: 'equals', value: 'paid' }], actions: [{ type: 'create_record', config: { entity: 'LedgerEntry' } }] },
    { name: 'אישור הוצאה גדולה', category: 'finance', trigger: { type: 'record_created', entity: 'Expense' }, conditions: [{ field: 'amount', operator: 'gt', value: '5000' }], actions: [{ type: 'create_approval', config: { approver: 'finance_manager' } }] },
    { name: 'התראת חריגה מתקציב', category: 'finance', trigger: { type: 'record_created', entity: 'Expense' }, conditions: [{ field: 'amount', operator: 'gt', value: 'budget_remaining' }], actions: [{ type: 'send_notification', config: { to: 'manager' } }] },
    { name: 'סיכום יומי של הוצאות', category: 'finance', trigger: { type: 'scheduled', schedule: 'daily_5pm' }, actions: [{ type: 'send_email', config: { to: 'finance', template: 'daily_expenses' } }] },
    { name: 'יצירת זיכוי אוטומטי', category: 'finance', trigger: { type: 'record_created', entity: 'SalesOrder' }, conditions: [{ field: 'status', operator: 'equals', value: 'cancelled' }], actions: [{ type: 'create_record', config: { entity: 'CreditNote' } }] },
    
    // HR (7)
    { name: 'אישור חופשה', category: 'hr', trigger: { type: 'record_created', entity: 'TimeOffRequest' }, actions: [{ type: 'create_approval', config: { approver: 'manager' } }] },
    { name: 'התראה על בקשת חופשה דחופה', category: 'hr', trigger: { type: 'record_created', entity: 'TimeOffRequest' }, conditions: [{ field: 'start_date', operator: 'lt', value: '7_days' }], actions: [{ type: 'send_notification', config: { to: 'hr_manager' } }] },
    { name: 'רישום נוכחות אוטומטי', category: 'hr', trigger: { type: 'scheduled', schedule: 'workdays_9am' }, actions: [{ type: 'create_record', config: { entity: 'Attendance' } }] },
    { name: 'התראת יום הולדת עובד', category: 'hr', trigger: { type: 'scheduled', schedule: 'daily' }, actions: [{ type: 'send_notification', config: { to: 'hr', subject: 'birthdays' } }] },
    { name: 'תזכורת להשלמת הכשרה', category: 'hr', trigger: { type: 'record_created', entity: 'Training' }, actions: [{ type: 'send_notification', config: { to: 'employee', delay: '1_day_before' } }] },
    { name: 'התראה על פג תוקף הסמכה', category: 'hr', trigger: { type: 'scheduled', schedule: 'weekly' }, actions: [{ type: 'send_notification', config: { to: 'hr', subject: 'expiring_certifications' } }] },
    { name: 'סיכום שעות חודשי', category: 'hr', trigger: { type: 'scheduled', schedule: 'monthly_end' }, actions: [{ type: 'generate_document', config: { template: 'monthly_hours' } }] },
    
    // Quality & Support (7)
    { name: 'יצירת NCR על תקלה', category: 'quality', trigger: { type: 'record_created', entity: 'Defect' }, conditions: [{ field: 'severity', operator: 'equals', value: 'high' }], actions: [{ type: 'create_record', config: { entity: 'NCR' } }] },
    { name: 'שיוך טיקט תמיכה', category: 'support', trigger: { type: 'record_created', entity: 'SupportTicket' }, actions: [{ type: 'assign', config: { to: 'support_team' } }] },
    { name: 'הסלמת טיקט דחוף', category: 'support', trigger: { type: 'record_created', entity: 'SupportTicket' }, conditions: [{ field: 'priority', operator: 'equals', value: 'urgent' }], actions: [{ type: 'send_notification', config: { to: 'support_manager' } }] },
    { name: 'התראת הפרת SLA', category: 'support', trigger: { type: 'sla_timer', entity: 'SupportTicket' }, actions: [{ type: 'update_record', config: { field: 'sla_breached', value: 'true' } }, { type: 'send_notification', config: { to: 'manager' } }] },
    { name: 'תגובה אוטומטית לטיקט', category: 'support', trigger: { type: 'record_created', entity: 'SupportTicket' }, actions: [{ type: 'send_email', config: { template: 'ticket_received' } }] },
    { name: 'סקר שביעות רצון', category: 'support', trigger: { type: 'stage_changed', entity: 'SupportTicket' }, conditions: [{ field: 'status', operator: 'equals', value: 'resolved' }], actions: [{ type: 'send_email', config: { template: 'satisfaction_survey' } }] },
    { name: 'טיפול בתלונת איכות', category: 'quality', trigger: { type: 'record_created', entity: 'SupplierQualityClaim' }, actions: [{ type: 'create_approval', config: { approver: 'quality_manager' } }, { type: 'send_notification', config: { to: 'procurement' } }] }
];

export default function WorkflowTemplates({ onSelectTemplate }) {
    const [search, setSearch] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');

    const categories = [
        { value: 'all', label: 'הכל' },
        { value: 'sales', label: 'מכירות' },
        { value: 'production', label: 'ייצור' },
        { value: 'inventory', label: 'מלאי' },
        { value: 'finance', label: 'כספים' },
        { value: 'hr', label: 'משאבי אנוש' },
        { value: 'quality', label: 'איכות' },
        { value: 'support', label: 'תמיכה' }
    ];

    const filtered = templates.filter(t => 
        (selectedCategory === 'all' || t.category === selectedCategory) &&
        t.name.includes(search)
    );

    return (
        <div className="space-y-4 mt-6">
            <Input
                placeholder="חיפוש תבניות..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
            />

            <Tabs value={selectedCategory} onValueChange={setSelectedCategory} dir="rtl">
                <TabsList className="grid grid-cols-4 lg:grid-cols-8 w-full">
                    {categories.map(cat => (
                        <TabsTrigger key={cat.value} value={cat.value} className="text-xs">
                            {cat.label}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </Tabs>

            <div className="space-y-2">
                {filtered.map((template, i) => (
                    <Card key={i} className="hover:shadow-md transition-shadow">
                        <CardContent className="pt-4">
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="font-semibold mb-1">{template.name}</div>
                                    <div className="flex gap-2 text-xs text-slate-600">
                                        <Badge variant="outline">{template.category}</Badge>
                                        <span>טריגר: {template.trigger.type}</span>
                                        {template.actions.length > 0 && (
                                            <span>• {template.actions.length} פעולות</span>
                                        )}
                                    </div>
                                </div>
                                <Button size="sm" onClick={() => onSelectTemplate(template)}>
                                    <Play className="w-3 h-3 ml-1" />
                                    השתמש
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="text-center text-sm text-slate-500 pt-4">
                {filtered.length} תבניות זמינות
            </div>
        </div>
    );
}