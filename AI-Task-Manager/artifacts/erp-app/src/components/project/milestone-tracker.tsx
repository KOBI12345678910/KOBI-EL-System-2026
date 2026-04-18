import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Clock, AlertCircle, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { format, isPast } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const statusConfig = {
    pending: { label: 'ממתין', color: 'text-slate-600', bg: 'bg-slate-100', icon: Clock },
    in_progress: { label: 'בתהליך', color: 'text-blue-600', bg: 'bg-blue-100', icon: Clock },
    completed: { label: 'הושלם', color: 'text-emerald-600', bg: 'bg-emerald-100', icon: CheckCircle2 },
    delayed: { label: 'בעיכוב', color: 'text-red-600', bg: 'bg-red-100', icon: AlertCircle }
};

export default function MilestoneTracker({ project, onUpdate }) {
    const [expanded, setExpanded] = useState(null);
    const [showCreate, setShowCreate] = useState(false);
    const [newMilestone, setNewMilestone] = useState({ name: '', target_date: '', description: '' });

    const milestones = project.milestones || [];
    const completedMilestones = milestones.filter(m => m.status === 'completed').length;
    const overallProgress = milestones.length > 0 ? Math.round((completedMilestones / milestones.length) * 100) : 0;

    const handleAddMilestone = () => {
        if (newMilestone.name && newMilestone.target_date) {
            const updated = [...milestones, { ...newMilestone, id: Date.now().toString(), status: 'pending' }];
            onUpdate({ milestones: updated });
            setNewMilestone({ name: '', target_date: '', description: '' });
            setShowCreate(false);
        }
    };

    const handleDeleteMilestone = (id) => {
        const updated = milestones.filter(m => m.id !== id);
        onUpdate({ milestones: updated });
    };

    const handleStatusChange = (id, status) => {
        const updated = milestones.map(m => 
            m.id === id ? { ...m, status, completion_date: status === 'completed' ? new Date().toISOString().split('T')[0] : null } : m
        );
        onUpdate({ milestones: updated });
    };

    return (
        <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-indigo-600" />
                        אבני דרך (Milestones)
                    </CardTitle>
                    <Dialog open={showCreate} onOpenChange={setShowCreate}>
                        <DialogTrigger asChild>
                            <Button size="sm" variant="outline" className="gap-1"><Plus className="w-3 h-3" />אבן דרך</Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader><DialogTitle>אבן דרך חדשה</DialogTitle></DialogHeader>
                            <div className="space-y-3">
                                <div>
                                    <label className="text-sm font-medium">שם</label>
                                    <Input value={newMilestone.name} onChange={(e) => setNewMilestone({...newMilestone, name: e.target.value})} className="mt-1" />
                                </div>
                                <div>
                                    <label className="text-sm font-medium">תאריך יעד</label>
                                    <Input type="date" value={newMilestone.target_date} onChange={(e) => setNewMilestone({...newMilestone, target_date: e.target.value})} className="mt-1" />
                                </div>
                                <div>
                                    <label className="text-sm font-medium">תיאור</label>
                                    <Textarea value={newMilestone.description} onChange={(e) => setNewMilestone({...newMilestone, description: e.target.value})} className="mt-1 h-20" />
                                </div>
                                <Button onClick={handleAddMilestone} className="w-full">צור אבן דרך</Button>
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">התקדמות כללית</span>
                        <span className="text-sm font-semibold">{overallProgress}%</span>
                    </div>
                    <Progress value={overallProgress} className="h-2" />
                </div>

                <div className="space-y-2">
                    {milestones.length === 0 ? (
                        <p className="text-center text-slate-400 py-4 text-sm">אין אבני דרך עדיין</p>
                    ) : (
                        milestones.map((milestone, idx) => {
                            const config = statusConfig[milestone.status];
                            const Config = config.icon;
                            const isDelayed = milestone.status !== 'completed' && isPast(new Date(milestone.target_date));

                            return (
                                <div key={milestone.id} className="border border-slate-200 rounded-lg p-3">
                                    <div className="flex items-start justify-between cursor-pointer" onClick={() => setExpanded(expanded === milestone.id ? null : milestone.id)}>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <Config className={`w-4 h-4 ${config.color}`} />
                                                <p className="font-medium text-sm">{milestone.name}</p>
                                                {isDelayed && <Badge className="bg-red-100 text-red-700 text-xs">בעיכוב</Badge>}
                                            </div>
                                            <p className="text-xs text-slate-500 mt-1">{format(new Date(milestone.target_date), 'dd/MM/yyyy')}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Badge className={`${config.bg} ${config.color} text-xs`}>{config.label}</Badge>
                                            {expanded === milestone.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                        </div>
                                    </div>

                                    {expanded === milestone.id && (
                                        <div className="mt-3 pt-3 border-t border-slate-200 space-y-3">
                                            {milestone.description && <p className="text-sm text-slate-600">{milestone.description}</p>}
                                            <div className="flex gap-2">
                                                {['pending', 'in_progress', 'completed'].map(status => (
                                                    <Button
                                                        key={status}
                                                        size="sm"
                                                        variant={milestone.status === status ? 'default' : 'outline'}
                                                        onClick={() => handleStatusChange(milestone.id, status)}
                                                        className="text-xs"
                                                    >
                                                        {statusConfig[status].label}
                                                    </Button>
                                                ))}
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => handleDeleteMilestone(milestone.id)}
                                                    className="text-red-600 ml-auto"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </CardContent>
        </Card>
    );
}