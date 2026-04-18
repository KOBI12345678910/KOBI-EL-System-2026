import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { entityCreate, entityFilter, entityList, entityUpdate } from "@/lib/entity-api";

export default function AlertsManager() {
    const queryClient = useQueryClient();

    const { data: alertRules = [] } = useQuery({
        queryKey: ['alert-rules'],
        queryFn: () => entityList<any>("alert-rules", '-priority', 100)
    });

    const { data: todayAttendance = [] } = useQuery({
        queryKey: ['attendance', new Date().toISOString().split('T')[0]],
        queryFn: () => entityFilter<any>("attendances", {
            attendance_date: new Date().toISOString().split('T')[0]
        }, '-created_date', 200)
    });

    const { data: users = [] } = useQuery({
        queryKey: ['users'],
        queryFn: () => entityList<any>("users")
    });

    const createAlertMutation = useMutation({
        mutationFn: (alertData) => entityCreate<any>("alert-logs", alertData)
    });

    const sendEmailMutation = useMutation({
        mutationFn: async (emailData) => {
            return fetch("/api/integrations/send-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(emailData) });
        }
    });

    // Check for alerts periodically
    useEffect(() => {
        const checkAlerts = async () => {
            const now = new Date();
            const currentHour = now.getHours();

            // Process each active alert rule
            for (const rule of alertRules.filter(r => r.is_active)) {
                // Check day of week
                if (rule.enabled_days && !rule.enabled_days.includes(now.getDay())) {
                    continue;
                }

                switch (rule.alert_type) {
                    case 'absence':
                        await checkAbsenceAlert(rule);
                        break;
                    case 'overtime':
                        await checkOvertimeAlert(rule);
                        break;
                    case 'late_arrival':
                        await checkLateArrivalAlert(rule);
                        break;
                    case 'early_departure':
                        await checkEarlyDepartureAlert(rule);
                        break;
                }
            }
        };

        const interval = setInterval(checkAlerts, 5 * 60 * 1000); // Check every 5 minutes
        return () => clearInterval(interval);
    }, [alertRules]);

    const checkAbsenceAlert = async (rule) => {
        const absenceThreshold = rule.trigger_conditions?.absence_after_hours || 2;
        const missingEmployees = users.filter(user => 
            !todayAttendance.some(a => a.user_email === user.email)
        );

        const now = new Date();
        const workStartTime = new Date();
        workStartTime.setHours(8, 0, 0);
        const hoursSinceWorkStart = (now - workStartTime) / (1000 * 60 * 60);

        if (hoursSinceWorkStart >= absenceThreshold) {
            for (const employee of missingEmployees) {
                await sendAlert(rule, employee, `לא הגיע לעבודה עד שעה ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`);
            }
        }
    };

    const checkOvertimeAlert = async (rule) => {
        const overtimeThreshold = rule.trigger_conditions?.overtime_threshold || 10;
        
        for (const record of todayAttendance) {
            if ((record.hours_worked || 0) >= overtimeThreshold && !record.check_out_time) {
                await sendAlert(rule, { 
                    full_name: record.user_name, 
                    email: record.user_email 
                }, `עובד עבד ${record.hours_worked} שעות - חורג מהסף של ${overtimeThreshold} שעות`);
            }
        }
    };

    const checkLateArrivalAlert = async (rule) => {
        const lateThreshold = rule.trigger_conditions?.late_arrival_minutes || 5;
        const lateEmployees = todayAttendance.filter(a => {
            const [hour, minute] = a.check_in_time?.split(':').map(Number) || [0, 0];
            const checkinTime = new Date();
            checkinTime.setHours(hour, minute, 0);
            const workStartTime = new Date();
            workStartTime.setHours(8, 0, 0);
            const minutesLate = (checkinTime - workStartTime) / (1000 * 60);
            return minutesLate >= lateThreshold;
        });

        for (const record of lateEmployees) {
            const [hour, minute] = record.check_in_time?.split(':').map(Number) || [0, 0];
            const minutesLate = (hour - 8) * 60 + (minute - 0);
            await sendAlert(rule, {
                full_name: record.user_name,
                email: record.user_email
            }, `נכנס באיחור של ${minutesLate} דקות`);
        }
    };

    const checkEarlyDepartureAlert = async (rule) => {
        const earlyThreshold = rule.trigger_conditions?.early_departure_minutes || 5;
        const earlyEmployees = todayAttendance.filter(a => {
            if (!a.check_out_time) return false;
            const [hour, minute] = a.check_out_time?.split(':').map(Number) || [0, 0];
            const checkoutTime = new Date();
            checkoutTime.setHours(hour, minute, 0);
            const workEndTime = new Date();
            workEndTime.setHours(17, 0, 0);
            const minutesEarly = (workEndTime - checkoutTime) / (1000 * 60);
            return minutesEarly >= earlyThreshold;
        });

        for (const record of earlyEmployees) {
            const [hour, minute] = record.check_out_time?.split(':').map(Number) || [0, 0];
            const checkoutTime = new Date();
            checkoutTime.setHours(hour, minute, 0);
            const workEndTime = new Date();
            workEndTime.setHours(17, 0, 0);
            const minutesEarly = (workEndTime - checkoutTime) / (1000 * 60);
            
            await sendAlert(rule, {
                full_name: record.user_name,
                email: record.user_email
            }, `יצא מוקדם בעלות ${Math.round(minutesEarly)} דקות`);
        }
    };

    const sendAlert = async (rule, employee, triggerValue) => {
        try {
            // Create alert log
            const alertLog = await createAlertMutation.mutateAsync({
                alert_rule_id: rule.id,
                alert_type: rule.alert_type,
                employee_email: employee.email,
                employee_name: employee.full_name,
                trigger_value: triggerValue,
                message: `${rule.name}: ${triggerValue}`
            });

            // Send emails to recipients
            for (const recipient of rule.recipients) {
                const recipientEmail = recipient.user_email || recipient.email;
                if (!recipientEmail) continue;

                await sendEmailMutation.mutateAsync({
                    to: recipientEmail,
                    subject: `התראה: ${rule.name}`,
                    body: `
                        <h2>${rule.name}</h2>
                        <p>עובד: <strong>${employee.full_name}</strong></p>
                        <p>אימייל: ${employee.email}</p>
                        <p>פרטים: ${triggerValue}</p>
                        <p>זמן: ${new Date().toLocaleString('he-IL')}</p>
                    `
                });
            }

            // Update alert log with sent status
            await entityUpdate<any>("alert-logs", alertLog.id, {
                status: 'sent',
                recipients_sent: rule.recipients.map(r => ({
                    email: r.user_email || r.email,
                    sent_at: new Date().toISOString(),
                    status: 'sent'
                }))
            });
        } catch (error) {
            console.error('Error sending alert:', error);
        }
    };

    return null;
}