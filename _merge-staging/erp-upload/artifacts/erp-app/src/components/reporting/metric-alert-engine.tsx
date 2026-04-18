import { useEffect, useState } from "react";
import { toast } from 'sonner';
import { entityCreate, entityList } from "@/lib/entity-api";

// מנוע התראות חכם על שינויים במדדים
export default function MetricAlertEngine() {
    const [previousMetrics, setPreviousMetrics] = useState(null);

    useEffect(() => {
        const interval = setInterval(checkMetrics, 5 * 60 * 1000); // כל 5 דקות
        checkMetrics();
        return () => clearInterval(interval);
    }, []);

    const checkMetrics = async () => {
        try {
            const currentMetrics = await calculateMetrics();
            
            if (previousMetrics) {
                await detectSignificantChanges(previousMetrics, currentMetrics);
            }
            
            setPreviousMetrics(currentMetrics);
        } catch (error) {
            console.error('Metric alert error:', error);
        }
    };

    const calculateMetrics = async () => {
        const [leads, orders, production, invoices] = await Promise.all([
            entityList<any>("leads", '-created_date', 100),
            entityList<any>("sales-orders", '-created_date', 100),
            entityList<any>("production-orders", '-created_date', 100),
            entityList<any>("invoices", '-created_date', 100)
        ]);

        return {
            crm: {
                total_leads: leads.length,
                hot_leads: leads.filter(l => l.grade === 'hot').length,
                conversion_rate: leads.length > 0 ? (leads.filter(l => l.stage === 'won').length / leads.length * 100) : 0
            },
            sales: {
                total_revenue: invoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + (i.total || 0), 0),
                total_orders: orders.length,
                avg_order_value: orders.length > 0 ? orders.reduce((sum, o) => sum + (o.total || 0), 0) / orders.length : 0
            },
            production: {
                active_orders: production.filter(p => p.status === 'in_progress').length,
                completion_rate: production.length > 0 ? (production.filter(p => p.status === 'completed').length / production.length * 100) : 0,
                delayed_orders: production.filter(p => p.delayed).length
            },
            finance: {
                collection_rate: invoices.length > 0 ? (invoices.filter(i => i.status === 'paid').length / invoices.length * 100) : 0,
                overdue: invoices.filter(i => i.status === 'overdue').length
            }
        };
    };

    const detectSignificantChanges = async (prev, curr) => {
        // CRM Alerts
        if (curr.crm.hot_leads > prev.crm.hot_leads + 3) {
            await createAlert('crm', 'high', `${curr.crm.hot_leads - prev.crm.hot_leads} לידים חמים חדשים!`);
            toast.success(`🔥 ${curr.crm.hot_leads - prev.crm.hot_leads} לידים חמים חדשים נוספו!`, { duration: 7000 });
        }

        const conversionChange = Math.abs(curr.crm.conversion_rate - prev.crm.conversion_rate);
        if (conversionChange > 5) {
            await createAlert('crm', 'medium', `שיעור המרה ${curr.crm.conversion_rate > prev.crm.conversion_rate ? 'עלה' : 'ירד'} ב-${conversionChange.toFixed(1)}%`);
        }

        // Sales Alerts
        const revenueChange = ((curr.sales.total_revenue - prev.sales.total_revenue) / prev.sales.total_revenue * 100);
        if (Math.abs(revenueChange) > 15) {
            await createAlert('sales', 'high', `הכנסות ${revenueChange > 0 ? 'עלו' : 'ירדו'} ב-${Math.abs(revenueChange).toFixed(1)}%`);
            toast.info(`💰 שינוי משמעותי בהכנסות: ${revenueChange > 0 ? '+' : ''}${revenueChange.toFixed(1)}%`);
        }

        // Production Alerts
        if (curr.production.delayed_orders > prev.production.delayed_orders + 2) {
            await createAlert('production', 'critical', `${curr.production.delayed_orders - prev.production.delayed_orders} הזמנות ייצור חדשות באיחור`);
            toast.error(`⏰ ${curr.production.delayed_orders - prev.production.delayed_orders} הזמנות ייצור נוספות באיחור!`);
        }

        // Finance Alerts
        if (curr.finance.overdue > prev.finance.overdue + 3) {
            await createAlert('finance', 'high', `${curr.finance.overdue - prev.finance.overdue} חשבוניות נוספות באיחור`);
            toast.warning(`💳 ${curr.finance.overdue - prev.finance.overdue} חשבוניות חדשות באיחור`);
        }
    };

    const createAlert = async (category, severity, message) => {
        await entityCreate<any>("alerts", {
            title: `${category.toUpperCase()} Metric Change`,
            message: message,
            severity: severity,
            category: 'metric_change',
            status: 'active',
            source: 'ai_monitoring'
        });
    };

    return null;
}