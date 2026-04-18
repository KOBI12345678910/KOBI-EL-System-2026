import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function TimeTracker({ task, users = [], onUpdate }) {
    const [showAdd, setShowAdd] = useState(false);
    const [newEntry, setNewEntry] = useState({ user_email: '', hours: '', date: new Date().toISOString().split('T')[0], description: '' });

    const timeEntries = task.time_entries || [];
    const totalHours = timeEntries.reduce((sum, e) => sum + (e.hours || 0), 0);
    const costRate = task.cost_rate || 0;
    const totalCost = (totalHours * costRate).toLocaleString();
    const overBudget = totalHours > (task.estimated_hours || 0);

    const handleAddEntry = () => {
        if (newEntry.user_email && newEntry.hours && newEntry.date) {
            const user = users.find(u => u.email === newEntry.user_email);
            const updated = [...timeEntries, {
                id: Date.now().toString(),
                user_email: newEntry.user_email,
                user_name: user?.full_name || 'unknown',
                hours: parseFloat(newEntry.hours),
                date: newEntry.date,
                description: newEntry.description
            }];
            onUpdate({ 
                time_entries: updated,
                actual_hours: (task.actual_hours || 0) + parseFloat(newEntry.hours)
            });
            setNewEntry({ user_email: '', hours: '', date: new Date().toISOString().split('T')[0], description: '' });
            setShowAdd(false);
        }
    };

    const handleDelete = (id) => {
        const entry = timeEntries.find(e => e.id === id);
        const updated = timeEntries.filter(e => e.id !== id);
        onUpdate({
            time_entries: updated,
            actual_hours: Math.max(0, (task.actual_hours || 0) - (entry.hours || 0))
        });
    };

    return (
        <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Clock className="w-5 h-5 text-indigo-600" />
                        מעקב זמן
                    </CardTitle>
                    <Dialog open={showAdd} onOpenChange={setShowAdd}>
                        <DialogTrigger asChild>
                            <Button size="sm" variant="outline" className="gap-1"><Plus className="w-3 h-3" />רישום</Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader><DialogTitle>רישום שעות</DialogTitle></DialogHeader>
                            <div className="space-y-3">
                                <div>
                                    <label className="text-sm font-medium">עובד</label>
                                    <Select value={newEntry.user_email} onValueChange={(v) => setNewEntry({...newEntry, user_email: v})}>
                                        <SelectTrigger className="mt-1"><SelectValue placeholder="בחר עובד" /></SelectTrigger>
                                        <SelectContent>
                                            {users.map(u => <SelectItem key={u.email} value={u.email}>{u.full_name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <label className="text-sm font-medium">שעות</label>
                                    <Input type="number" step="0.5" min="0" value={newEntry.hours} onChange={(e) => setNewEntry({...newEntry, hours: e.target.value})} className="mt-1" />
                                </div>
                                <div>
                                    <label className="text-sm font-medium">תאריך</label>
                                    <Input type="date" value={newEntry.date} onChange={(e) => setNewEntry({...newEntry, date: e.target.value})} className="mt-1" />
                                </div>
                                <div>
                                    <label className="text-sm font-medium">הערות</label>
                                    <Textarea value={newEntry.description} onChange={(e) => setNewEntry({...newEntry, description: e.target.value})} className="mt-1 h-16" />
                                </div>
                                <Button onClick={handleAddEntry} className="w-full">הוסף רישום</Button>
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-3 text-center p-3 bg-slate-50 rounded-lg">
                    <div>
                        <p className="text-xs text-slate-500">אמיתי</p>
                        <p className="text-lg font-bold text-slate-900">{totalHours}</p>
                    </div>
                    <div>
                        <p className="text-xs text-slate-500">משוער</p>
                        <p className="text-lg font-bold text-slate-900">{task.estimated_hours || 0}</p>
                    </div>
                    <div>
                        <p className="text-xs text-slate-500">עלות</p>
                        <p className={`text-lg font-bold ${costRate > 0 ? 'text-slate-900' : 'text-slate-400'}`}>₪{costRate > 0 ? totalCost : '-'}</p>
                    </div>
                </div>

                {overBudget && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-sm text-red-700">
                            <strong>עברת את התקציב:</strong> {(totalHours - (task.estimated_hours || 0)).toFixed(1)} שעות יותר מהמשוער
                        </p>
                    </div>
                )}

                <div className="space-y-2">
                    {timeEntries.length === 0 ? (
                        <p className="text-center text-slate-400 py-4 text-sm">אין רישומי זמן</p>
                    ) : (
                        timeEntries.map(entry => (
                            <div key={entry.id} className="flex items-start justify-between p-2 border border-slate-100 rounded-lg hover:bg-slate-50">
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium">{entry.user_name}</p>
                                    <p className="text-xs text-slate-500">{format(new Date(entry.date), 'dd/MM/yyyy')}</p>
                                    {entry.description && <p className="text-xs text-slate-600 mt-1">{entry.description}</p>}
                                </div>
                                <div className="flex items-center gap-2">
                                    <Badge className="bg-blue-100 text-blue-700 text-xs">{entry.hours}h</Badge>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => handleDelete(entry.id)}
                                        className="text-red-600 p-0 h-6 w-6"
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </Button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </CardContent>
        </Card>
    );
}