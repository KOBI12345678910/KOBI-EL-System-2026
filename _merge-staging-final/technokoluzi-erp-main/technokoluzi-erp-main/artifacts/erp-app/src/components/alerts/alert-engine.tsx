import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { entityCreate, entityFilter, entityList, entityUpdate } from "@/lib/entity-api";

// מנוע התראות חכם שבודק תנאים ושולח התראות
export default function AlertEngine() {
    const [lastCheck, setLastCheck] = useState({});

    useEffect(() => {
        // בדוק כל 5 דקות
        const interval = setInterval(checkAlerts, 5 * 60 * 1000);
        checkAlerts(); // בדיקה ראשונית
        return () => clearInterval(interval);
    }, []);

    const checkAlerts = async () => {
        try {
            const alertRules = await entityFilter<any>("alert-rules", { is_active: true });
            const currentMetrics = await fetchMetrics();

            for (const rule of alertRules) {
                // בדוק cooldown
                if (shouldSkipDueToCooldown(rule)) continue;

                // בדוק מגבלה יומית
                if (hasReachedDailyLimit(rule)) continue;

                // בדוק תנאים
                const conditionsMet = await evaluateConditions(rule.conditions, rule.logic, currentMetrics, rule.id);

                if (conditionsMet) {
                    await triggerAlert(rule, currentMetrics);
                }
            }
        } catch (error) {
            console.error('Alert engine error:', error);
        }
    };

    const fetchMetrics = async () => {
        try {
            const [leads, orders, invoices, production, tasks] = await Promise.all([
                entityList<any>("leads", '-created_date', 200),
                entityList<any>("sales-orders", '-created_date', 200),
                entityList<any>("invoices", '-created_date', 200),
                entityList<any>("production-orders", '-created_date', 200),
                entityList<any>("tasks", '-created_date', 200)
            ]);

            return {
                revenue: invoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + (i.total || 0), 0),
                leads_count: leads.length,
                conversion_rate: leads.length > 0 ? (leads.filter(l => l.stage === 'won').length / leads.length * 100) : 0,
                overdue_invoices: invoices.filter(i => i.status === 'overdue').length,
                hot_leads: leads.filter(l => l.grade === 'hot').length,
                production_delays: production.filter(p => p.delayed).length,
                avg_order_value: orders.length > 0 ? orders.reduce((sum, o) => sum + (o.total || 0), 0) / orders.length : 0,
                task_completion_rate: tasks.length > 0 ? (tasks.filter(t => t.status === 'done').length / tasks.length * 100) : 0,
                inventory_level: 100, // Mock
                customer_satisfaction: 85 // Mock
            };
        } catch (error) {
            console.error('Metrics fetch error:', error);
            return {};
        }
    };

    const evaluateConditions = async (conditions, logic, metrics, ruleId) => {
        if (!conditions || conditions.length === 0) return false;

        const results = await Promise.all(
            conditions.map(async (condition) => {
                const currentValue = metrics[condition.metric];
                if (currentValue === undefined) return false;

                const targetValue = parseFloat(condition.value);

                // Get previous value for comparison
                const previousValue = lastCheck[`${ruleId}_${condition.metric}`] || currentValue;

                switch (condition.operator) {
                    case 'equals':
                        return currentValue === targetValue;
                    case 'not_equals':
                        return currentValue !== targetValue;
                    case 'greater_than':
                        return currentValue > targetValue;
                    case 'less_than':
                        return currentValue < targetValue;
                    case 'greater_or_equal':
                        return currentValue >= targetValue;
                    case 'less_or_equal':
                        return currentValue <= targetValue;
                    case 'increases_by':
                        const increasePercent = ((currentValue - previousValue) / previousValue) * 100;
                        return increasePercent >= targetValue;
                    case 'decreases_by':
                        const decreasePercent = ((previousValue - currentValue) / previousValue) * 100;
                        return decreasePercent >= targetValue;
                    case 'changes_by':
                        const changePercent = Math.abs(((currentValue - previousValue) / previousValue) * 100);
                        return changePercent >= targetValue;
                    default:
                        return false;
                }
            })
        );

        // Store current values for next check
        conditions.forEach(condition => {
            lastCheck[`${ruleId}_${condition.metric}`] = metrics[condition.metric];
        });

        return logic === 'AND' ? results.every(r => r) : results.some(r => r);
    };

    const shouldSkipDueToCooldown = (rule) => {
        if (!rule.last_triggered) return false;
        const cooldownMs = (rule.threshold_config?.cooldown_minutes || 60) * 60 * 1000;
        const timeSinceLastTrigger = Date.now() - new Date(rule.last_triggered).getTime();
        return timeSinceLastTrigger < cooldownMs;
    };

    const hasReachedDailyLimit = (rule) => {
        const maxPerDay = rule.threshold_config?.max_alerts_per_day || 10;
        const today = new Date().toDateString();
        const lastTriggeredDate = rule.last_triggered ? new Date(rule.last_triggered).toDateString() : null;
        
        if (lastTriggeredDate !== today) return false; // Reset count for new day
        
        return (rule.trigger_count || 0) >= maxPerDay;
    };

    const triggerAlert = async (rule, metrics) => {
        try {
            // Send notifications
            for (const channel of rule.channels || []) {
                await sendNotification(channel, rule, metrics);
            }

            // Update rule stats
            await entityUpdate<any>("alert-rules", rule.id, {
                last_triggered: new Date().toISOString(),
                trigger_count: (rule.trigger_count || 0) + 1
            });

            // Log the alert
            await entityCreate<any>("alerts", {
                rule_id: rule.id,
                title: rule.name,
                message: formatAlertMessage(rule, metrics),
                severity: rule.severity,
                status: 'active',
                triggered_at: new Date().toISOString()
            });

        } catch (error) {
            console.error('Alert trigger error:', error);
        }
    };

    const sendNotification = async (channel, rule, metrics) => {
        const message = formatAlertMessage(rule, metrics);

        switch (channel) {
            case 'in_app':
                toast.error(message, {
                    duration: 10000,
                    description: `התראה: ${rule.name}`,
                    action: {
                        label: 'צפה',
                        onClick: () => console.log('View alert')
                    }
                });
                break;

            case 'email':
                if (rule.recipients) {
                    for (const recipient of rule.recipients) {
                        if (recipient.type === 'email') {
                            await fetch("/api/integrations/send-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
                                to: recipient.value,
                                subject: `התראה: ${rule.name}`,
                                body: `<h2>${rule.name}</h2><p>${message}</p><p>רמת חומרה: ${rule.severity}</p>`
                            }) });
                        }
                    }
                }
                break;

            case 'sms':
                // Integration with SMS service would go here
                console.log('SMS alert:', message);
                break;

            case 'push':
                // Integration with push notification service would go here
                console.log('Push notification:', message);
                break;
        }
    };

    const formatAlertMessage = (rule, metrics) => {
        let message = `התראה: ${rule.name}. `;
        
        rule.conditions?.forEach(condition => {
            const value = metrics[condition.metric];
            message += `${condition.metric}: ${value}. `;
        });

        return message;
    };

    return null; // Background component
}