import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import MilestoneTracker from './MilestoneTracker';
import TeamAssignments from './TeamAssignments';
import { format } from 'date-fns';
import { FolderKanban, Users, CheckCircle2, Clock, DollarSign, Calendar } from 'lucide-react';

export default function ProjectDetail({ project, users = [], onUpdate, onClose }) {
    const [activeTab, setActiveTab] = useState('overview');
    
    const completedMilestones = (project.milestones || []).filter(m => m.status === 'completed').length;
    const totalMilestones = (project.milestones || []).length;
    const budget = project.budget || 0;
    const spent = project.spent || 0;
    const budgetRemaining = budget - spent;

    return (
        <div className="space-y-6">
            {/* Header */}
            <Card className="border-0 shadow-lg bg-gradient-to-r from-indigo-50 to-purple-50">
                <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                        <div className="flex-1">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center">
                                    <FolderKanban className="w-6 h-6 text-indigo-600" />
                                </div>
                                <div>
                                    <h1 className="text-3xl font-bold text-slate-900">{project.name}</h1>
                                    <p className="text-slate-600">{project.customer_name}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 flex-wrap mt-4">
                                <Badge className="bg-blue-100 text-blue-700">{project.status}</Badge>
                                <Badge className="bg-orange-100 text-orange-700">{project.priority}</Badge>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-sm text-slate-500">התקדמות</p>
                            <p className="text-3xl font-bold text-slate-900">{project.progress || 0}%</p>
                        </div>
                    </div>
                    <div className="mt-4">
                        <Progress value={project.progress || 0} className="h-2" />
                    </div>
                </CardContent>
            </Card>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="border-0 shadow-sm">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                            <div>
                                <p className="text-xs text-slate-500">אבני דרך</p>
                                <p className="text-2xl font-bold">{completedMilestones}/{totalMilestones}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-0 shadow-sm">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                            <Users className="w-5 h-5 text-indigo-600" />
                            <div>
                                <p className="text-xs text-slate-500">צוות</p>
                                <p className="text-2xl font-bold">{(project.team_members || []).length}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-0 shadow-sm">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                            <DollarSign className="w-5 h-5 text-green-600" />
                            <div>
                                <p className="text-xs text-slate-500">תקציב</p>
                                <p className="text-lg font-bold">₪{(budgetRemaining / 1000).toFixed(0)}K</p>
                                <p className="text-xs text-slate-400">נותר</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-0 shadow-sm">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-purple-600" />
                            <div>
                                <p className="text-xs text-slate-500">סיום</p>
                                <p className="text-lg font-bold">{project.end_date ? format(new Date(project.end_date), 'dd/MM') : '-'}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                    <TabsTrigger value="overview">סקירה כללית</TabsTrigger>
                    <TabsTrigger value="milestones">אבני דרך</TabsTrigger>
                    <TabsTrigger value="team">צוות</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-4 mt-4">
                    <Card className="border-0 shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-lg">תיאור הפרויקט</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-slate-600">{project.description || 'אין תיאור'}</p>
                        </CardContent>
                    </Card>

                    <Card className="border-0 shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-lg">תקציב ותקציב שנוצל</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                <div>
                                    <div className="flex justify-between mb-2">
                                        <span className="text-sm font-medium">תקציב כללי: ₪{budget.toLocaleString()}</span>
                                        <span className="text-sm text-slate-500">שנוצל: ₪{spent.toLocaleString()}</span>
                                    </div>
                                    <Progress value={budget > 0 ? (spent / budget) * 100 : 0} className="h-2" />
                                    <p className="text-xs text-slate-500 mt-2">₪{budgetRemaining.toLocaleString()} נותר</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="milestones" className="mt-4">
                    <MilestoneTracker project={project} onUpdate={onUpdate} />
                </TabsContent>

                <TabsContent value="team" className="mt-4">
                    <TeamAssignments entity={project} entityType="project" users={users} onUpdate={onUpdate} />
                </TabsContent>
            </Tabs>
        </div>
    );
}