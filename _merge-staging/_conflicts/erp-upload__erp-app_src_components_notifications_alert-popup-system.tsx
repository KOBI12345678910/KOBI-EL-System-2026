import { useState, useEffect } from "react";
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Clock, CheckSquare, TrendingDown, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { entityFilter, entityList } from "@/lib/entity-api";
import { authJson } from "@/lib/utils";

export default function AlertPopupSystem() {
    const [alerts, setAlerts] = useState([]);
    const [user, setUser] = useState(null);

    useEffect(() => {
        authJson("/api/auth/me").then(setUser).catch(() => {});
    }, []);

    // Meetings - פגישות היום
    const { data: meetings = [] } = useQuery({
        queryKey: ['upcomingMeetings'],
        queryFn: async () => {
            if (!user) return [];
            try {
                const today = new Date().toISOString().split('T')[0];
                const allMeetings = await entityList<any>("meetings");
                return allMeetings.filter(m => 
                    m.meeting_date?.startsWith(today) && 
                    new Date(m.meeting_date) > new Date()
                );
            } catch (error) {
                console.error('Failed to fetch meetings:', error);
                return [];
            }
        },
        enabled: !!user,
        refetchInterval: 300000
    });

    // Tasks - משימות שדחופות
    const { data: urgentTasks = [] } = useQuery({
        queryKey: ['urgentTasks'],
        queryFn: async () => {
            if (!user) return [];
            try {
                const allTasks = await entityList<any>("tasks");
                const now = new Date();
                return allTasks.filter(t => 
                    t.status !== 'done' && 
                    t.priority === 'high' &&
                    t.due_date &&
                    new Date(t.due_date) > now &&
                    new Date(t.due_date) - now < 24 * 60 * 60 * 1000
                );
            } catch (error) {
                console.error('Failed to fetch tasks:', error);
                return [];
            }
        },
        enabled: !!user,
        refetchInterval: 300000
    });

    // Orders - בעיות בהזמנות
    const { data: problemOrders = [] } = useQuery({
        queryKey: ['problemOrders'],
        queryFn: async () => {
            if (!user) return [];
            try {
                const allOrders = await entityList<any>("orders");
                return allOrders.filter(o => 
                    o.status === 'delayed' || o.status === 'problem'
                ).slice(0, 3);
            } catch (error) {
                console.error('Failed to fetch orders:', error);
                return [];
            }
        },
        enabled: !!user,
        refetchInterval: 600000
    });

    // Production Issues - בעיות ייצור
    const { data: productionAlerts = [] } = useQuery({
        queryKey: ['productionAlerts'],
        queryFn: async () => {
            if (!user) return [];
            try {
                const alerts = await entityList<any>("alerts");
                return alerts.filter(a => 
                    a.severity === 'critical' || a.severity === 'high'
                ).slice(0, 3);
            } catch (error) {
                console.error('Failed to fetch production alerts:', error);
                return [];
            }
        },
        enabled: !!user,
        refetchInterval: 300000
    });

    // Financial Issues - בעיות כספיות
    const { data: financialAlerts = [] } = useQuery({
        queryKey: ['financialAlerts'],
        queryFn: async () => {
            if (!user) return [];
            try {
                const alerts = await entityFilter<any>("ai-recommendations", {
                    recommendation_type: 'risk_mitigation'
                });
                return alerts.filter(a => a.priority === 'critical').slice(0, 2);
            } catch (error) {
                console.error('Failed to fetch financial alerts:', error);
                return [];
            }
        },
        enabled: !!user,
        refetchInterval: 600000
    });

    // Build alerts array
    useEffect(() => {
        const newAlerts = [];

        // מפגישות
        meetings?.forEach((m) => {
            const meetingTime = new Date(m.meeting_date);
            const now = new Date();
            const minutesUntil = Math.floor((meetingTime - now) / 60000);
            
            if (minutesUntil <= 60 && minutesUntil > 0) {
                newAlerts.push({
                    id: `meeting-${m.id}`,
                    type: 'meeting',
                    icon: Clock,
                    title: 'פגישה בקרוב',
                    message: `${m.title} בעוד ${minutesUntil} דקות`,
                    severity: 'high',
                    color: 'bg-red-500'
                });
            }
        });

        // ממשימות דחופות
        urgentTasks?.forEach((t) => {
            newAlerts.push({
                id: `task-${t.id}`,
                type: 'task',
                icon: CheckSquare,
                title: 'משימה דחופה',
                message: t.title,
                severity: 'high',
                color: 'bg-orange-500'
            });
        });

        // מבעיות בהזמנות
        problemOrders?.forEach((o) => {
            newAlerts.push({
                id: `order-${o.id}`,
                type: 'order',
                icon: TrendingDown,
                title: 'בעיה בהזמנה',
                message: `הזמנה ${o.id} - ${o.status}`,
                severity: 'critical',
                color: 'bg-red-600'
            });
        });

        // מתראות ייצור
        productionAlerts?.forEach((a) => {
            newAlerts.push({
                id: `production-${a.id}`,
                type: 'production',
                icon: AlertTriangle,
                title: 'בעיה בייצור',
                message: a.name || 'בעיה קריטית בקו הייצור',
                severity: 'critical',
                color: 'bg-red-600'
            });
        });

        // מתראות כספיות
        financialAlerts?.forEach((a) => {
            newAlerts.push({
                id: `finance-${a.id}`,
                type: 'finance',
                icon: TrendingDown,
                title: 'אזהרה כספית',
                message: a.title || 'בעיה כספית קריטית',
                severity: 'critical',
                color: 'bg-red-700'
            });
        });

        // הגבל ל-5 התראות ויותר חשובות קודם
        const sorted = newAlerts.sort((a, b) => {
            const severityMap = { critical: 3, high: 2, medium: 1 };
            return severityMap[b.severity] - severityMap[a.severity];
        }).slice(0, 5);

        setAlerts(sorted);
    }, [meetings?.length, urgentTasks?.length, problemOrders?.length, productionAlerts?.length, financialAlerts?.length]);

    const removeAlert = (id) => {
        setAlerts(alerts.filter(a => a.id !== id));
    };

    return (
        <div className="fixed top-6 right-6 z-50 space-y-2 max-w-sm">
            <AnimatePresence>
                {alerts.map((alert) => {
                    const Icon = alert.icon;
                    return (
                        <motion.div
                            key={alert.id}
                            initial={{ x: 400, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: 400, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                            className={`${alert.color} text-white rounded-lg shadow-lg p-4 flex items-start gap-3 animate-pulse hover:animate-none`}
                        >
                            <Icon className="w-5 h-5 flex-shrink-0 mt-1" />
                            <div className="flex-1 min-w-0">
                                <h3 className="font-bold text-sm">{alert.title}</h3>
                                <p className="text-xs opacity-90 truncate">{alert.message}</p>
                            </div>
                            <button
                                onClick={() => removeAlert(alert.id)}
                                className="flex-shrink-0 hover:opacity-80"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
}