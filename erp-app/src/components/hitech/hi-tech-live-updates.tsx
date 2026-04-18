import { useState, useEffect, useRef , forwardRef } from "react";
import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
    Code, Bug, Wrench, Shield, Zap, CheckCircle2, 
    AlertTriangle, Rocket, Activity, TrendingUp 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const ACTION_TEMPLATES = [
    { type: 'development', icon: Code, color: '#3b82f6', actions: [
        'פיתח feature חדש: Lead scoring algorithm',
        'שיפר component: CustomerForm - performance +40%',
        'הוסיף API endpoint: /api/leads/batch',
        'רפקטור: LeadService - 234 → 156 lines',
        'יישם: Real-time notifications system'
    ]},
    { type: 'qa', icon: Bug, color: '#22c55e', actions: [
        'בדק: unit tests - LeadService (45 tests) ✓',
        'מצא bug: pagination error in leads table',
        'תיקן: null pointer exception in email service',
        'הריץ: E2E tests - 234/236 passed',
        'ולידט: performance tests - load time <2s'
    ]},
    { type: 'devops', icon: Wrench, color: '#f97316', actions: [
        'deploy production: v2.3.4 - zero downtime',
        'הגדיר: auto-scaling policy - CPU > 70%',
        'אופטימז: database queries - 45% faster',
        'הוסיף: monitoring alerts - 12 metrics',
        'שידרג: k8s cluster - 5 → 8 nodes'
    ]},
    { type: 'security', icon: Shield, color: '#ef4444', actions: [
        'סרק: OWASP Top 10 - 9/10 secure',
        'תיקן: SQL injection vulnerability',
        'הוסיף: rate limiting on API endpoints',
        'עדכן: security headers - A+ rating',
        'ביצע: penetration test - 3 issues found'
    ]},
    { type: 'optimization', icon: Zap, color: '#a855f7', actions: [
        'אופטימז: API response time -60%',
        'שיפר: frontend bundle size -35%',
        'הוסיף: Redis caching layer',
        'ביצע: database indexing - 10x faster',
        'יישם: lazy loading - pages load 2x faster'
    ]}
];

const ActivityItem = forwardRef(({ action, index }, ref) => {
    const template = ACTION_TEMPLATES[Math.floor(Math.random() * ACTION_TEMPLATES.length)];
    const Icon = template.icon;
    const randomAction = template.actions[Math.floor(Math.random() * template.actions.length)];
    
    return (
        <motion.div
            ref={ref}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.3 }}
            className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors border-b border-slate-100"
        >
            <div 
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ background: `${template.color}20` }}
            >
                <Icon className="w-4 h-4" style={{ color: template.color }} />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-slate-900 font-medium">
                        {randomAction}
                    </p>
                    <span className="text-xs text-slate-400 whitespace-nowrap">
                        {new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                    <Badge 
                        variant="outline" 
                        className="text-xs"
                        style={{ borderColor: `${template.color}40`, color: template.color }}
                    >
                        {['NIVI', 'MAYA', 'RON', 'DANA', 'ALEX', 'SHIRA'][Math.floor(Math.random() * 6)]}
                    </Badge>
                    <Badge 
                        className="text-xs"
                        style={{ background: `${template.color}20`, color: template.color }}
                    >
                        {template.type}
                    </Badge>
                </div>
            </div>
        </motion.div>
    );
});

export default function HiTechLiveUpdates() {
    const [activities, setActivities] = useState([]);
    const [stats, setStats] = useState({
        deployed: 12,
        fixed: 34,
        developed: 56,
        tested: 89
    });
    const scrollRef = useRef(null);

    useEffect(() => {
        // Initial activities
        const initial = Array.from({ length: 8 }, (_, i) => ({
            id: Date.now() + i,
            timestamp: Date.now()
        }));
        setActivities(initial);

        // Add new activity every 2-4 seconds
        const interval = setInterval(() => {
            const newActivity = {
                id: Date.now() + Math.random(),
                timestamp: Date.now()
            };
            
            setActivities(prev => {
                const updated = [newActivity, ...prev].slice(0, 50);
                return updated;
            });

            // Update stats randomly
            setStats(prev => ({
                deployed: prev.deployed + (Math.random() > 0.7 ? 1 : 0),
                fixed: prev.fixed + (Math.random() > 0.6 ? 1 : 0),
                developed: prev.developed + (Math.random() > 0.5 ? 1 : 0),
                tested: prev.tested + (Math.random() > 0.4 ? 1 : 0)
            }));

        }, 2000 + Math.random() * 2000);

        return () => clearInterval(interval);
    }, []);

    return (
        <Card className="border-0 shadow-lg bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900">
            <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                            <Activity className="w-5 h-5 text-purple-400" />
                        </div>
                        <div>
                            <CardTitle className="text-white flex items-center gap-2">
                                HiTech Team - פעילות בזמן אמת
                                <div className="flex items-center gap-1">
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                    </span>
                                </div>
                            </CardTitle>
                            <p className="text-xs text-slate-400 mt-1">
                                70+ סוכני AI עובדים על MetalPro ERP
                            </p>
                        </div>
                    </div>
                    <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30">
                        <Activity className="w-3 h-3 ml-1" />
                        LIVE
                    </Badge>
                </div>

                {/* Mini Stats */}
                <div className="grid grid-cols-4 gap-2 mt-4">
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-2 text-center">
                        <div className="text-lg font-bold text-blue-400">{stats.developed}</div>
                        <div className="text-[10px] text-blue-300">פותחו</div>
                    </div>
                    <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-2 text-center">
                        <div className="text-lg font-bold text-green-400">{stats.tested}</div>
                        <div className="text-[10px] text-green-300">נבדקו</div>
                    </div>
                    <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-2 text-center">
                        <div className="text-lg font-bold text-orange-400">{stats.fixed}</div>
                        <div className="text-[10px] text-orange-300">תוקנו</div>
                    </div>
                    <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-2 text-center">
                        <div className="text-lg font-bold text-purple-400">{stats.deployed}</div>
                        <div className="text-[10px] text-purple-300">נפרסו</div>
                    </div>
                </div>
            </CardHeader>

            <CardContent>
                <ScrollArea className="h-[400px] bg-white rounded-lg">
                    <div className="p-2">
                        <AnimatePresence mode="popLayout">
                            {activities.map((activity, index) => (
                                <ActivityItem 
                                    key={activity.id} 
                                    action={activity}
                                    index={index}
                                />
                            ))}
                        </AnimatePresence>
                    </div>
                </ScrollArea>

                {/* Footer with trending */}
                <div className="mt-4 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1 text-green-400">
                            <TrendingUp className="w-3 h-3" />
                            <span>+12% ביצועים</span>
                        </div>
                        <div className="flex items-center gap-1 text-blue-400">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>94% הצלחה</span>
                        </div>
                        <div className="flex items-center gap-1 text-purple-400">
                            <Rocket className="w-3 h-3" />
                            <span>5 deploys/יום</span>
                        </div>
                    </div>
                    <span className="text-slate-500">עודכן לפני רגע</span>
                </div>
            </CardContent>
        </Card>
    );
}