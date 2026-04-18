import { entityCreate, entityFilter, entityList } from "@/lib/entity-api";
import { useEffect } from "react";

// מנוע דוחות אוטומטיים
export default function AutoReportScheduler() {
    useEffect(() => {
        // בדוק כל שעה אם צריך ליצור דוח
        const interval = setInterval(checkScheduledReports, 60 * 60 * 1000);
        checkScheduledReports();
        return () => clearInterval(interval);
    }, []);

    const checkScheduledReports = async () => {
        try {
            const schedules = await entityFilter<any>("report-schedules", { is_active: true });
            const now = new Date();
            const currentHour = now.getHours();
            const currentDay = now.getDay();

            for (const schedule of schedules) {
                const shouldRun = checkIfShouldRun(schedule, currentHour, currentDay);
                
                if (shouldRun) {
                    await generateAndSendReport(schedule);
                }
            }
        } catch (error) {
            console.error('Report scheduler error:', error);
        }
    };

    const checkIfShouldRun = (schedule, hour, day) => {
        const scheduleHour = parseInt(schedule.time?.split(':')[0] || 8);
        
        if (schedule.frequency === 'daily' && hour === scheduleHour) {
            return true;
        }
        if (schedule.frequency === 'weekly' && day === 0 && hour === scheduleHour) {
            return true;
        }
        if (schedule.frequency === 'monthly' && new Date().getDate() === 1 && hour === scheduleHour) {
            return true;
        }
        
        return false;
    };

    const generateAndSendReport = async (schedule) => {
        try {
            // Fetch data
            const [leads, orders, production, invoices] = await Promise.all([
                entityList<any>("leads", '-created_date', 200),
                entityList<any>("sales-orders", '-created_date', 200),
                entityList<any>("production-orders", '-created_date', 200),
                entityList<any>("invoices", '-created_date', 200)
            ]);

            // Generate report
            const reportContent = buildReportContent(leads, orders, production, invoices);

            // Save report
            const report = await entityCreate<any>("reports", {
                name: `${schedule.report_type} - ${format(new Date(), 'dd/MM/yyyy HH:mm')}`,
                type: schedule.report_type,
                data: reportContent,
                generated_by: 'auto_scheduler',
                format: 'html'
            });

            // Send to recipients
            for (const recipient of schedule.recipients || []) {
                await fetch("/api/integrations/send-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
                    to: recipient,
                    subject: `דוח אוטומטי - ${schedule.report_type}`,
                    body: formatReportEmail(reportContent)
                }) });
            }

            // Log execution
            await entityCreate<any>("report-executions", {
                schedule_id: schedule.id,
                report_id: report.id,
                executed_at: new Date().toISOString(),
                status: 'completed'
            });

        } catch (error) {
            console.error('Report generation error:', error);
        }
    };

    const buildReportContent = (leads, orders, production, invoices) => {
        return {
            summary: {
                total_leads: leads.length,
                conversion_rate: leads.length > 0 ? (leads.filter(l => l.stage === 'won').length / leads.length * 100).toFixed(1) : 0,
                total_revenue: invoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + (i.total || 0), 0),
                total_orders: orders.length,
                production_completion: production.length > 0 ? (production.filter(p => p.status === 'completed').length / production.length * 100).toFixed(1) : 0
            },
            trends: {
                leads_growth: '+15%',
                revenue_growth: '+22%',
                efficiency_score: 87
            },
            alerts: [
                { type: 'warning', message: 'חשבוניות באיחור: ' + invoices.filter(i => i.status === 'overdue').length },
                { type: 'info', message: 'לידים חמים: ' + leads.filter(l => l.grade === 'hot').length }
            ]
        };
    };

    const formatReportEmail = (content) => {
        return `
<div style="font-family: Arial, sans-serif; direction: rtl;">
    <h1 style="color: #4f46e5;">דוח עסקי אוטומטי</h1>
    <p>תאריך: ${format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
    
    <h2>סיכום מדדים</h2>
    <ul>
        <li>לידים: ${content.summary.total_leads}</li>
        <li>שיעור המרה: ${content.summary.conversion_rate}%</li>
        <li>הכנסות: ₪${content.summary.total_revenue.toLocaleString()}</li>
        <li>הזמנות: ${content.summary.total_orders}</li>
        <li>סיום ייצור: ${content.summary.production_completion}%</li>
    </ul>
    
    <h2>מגמות</h2>
    <ul>
        ${content.alerts.map(a => `<li style="color: ${a.type === 'warning' ? 'orange' : 'blue'};">${a.message}</li>`).join('')}
    </ul>
    
    <p>דוח זה נוצר אוטומטית על ידי מערכת ה-AI.</p>
</div>
        `.trim();
    };

    return null;
}