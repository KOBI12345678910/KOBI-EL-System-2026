import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Plus, Trash2, Users } from 'lucide-react';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function TeamAssignments({ entity, entityType = 'project', users = [], onUpdate }) {
    const [showAdd, setShowAdd] = useState(false);
    const [selectedUser, setSelectedUser] = useState('');
    const [selectedRole, setSelectedRole] = useState('member');

    const members = entityType === 'project' ? (entity.team_members || []) : (entity.assignees || []);
    const isProject = entityType === 'project';

    const handleAdd = () => {
        if (selectedUser) {
            const user = users.find(u => u.email === selectedUser);
            const newMember = isProject ? {
                user_email: selectedUser,
                user_name: user?.full_name || 'unknown',
                role: selectedRole,
                joined_date: new Date().toISOString().split('T')[0]
            } : {
                user_email: selectedUser,
                user_name: user?.full_name || 'unknown',
                assigned_date: new Date().toISOString().split('T')[0]
            };

            const fieldName = isProject ? 'team_members' : 'assignees';
            onUpdate({ [fieldName]: [...members, newMember] });
            setSelectedUser('');
            setSelectedRole('member');
            setShowAdd(false);
        }
    };

    const handleRemove = (email) => {
        const fieldName = isProject ? 'team_members' : 'assignees';
        const updated = members.filter(m => m.user_email !== email);
        onUpdate({ [fieldName]: updated });
    };

    const roles = ['manager', 'lead', 'member', 'reviewer'];

    return (
        <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Users className="w-5 h-5 text-indigo-600" />
                        {isProject ? 'צוות הפרויקט' : 'מוקצה ל'}
                    </CardTitle>
                    <Dialog open={showAdd} onOpenChange={setShowAdd}>
                        <DialogTrigger asChild>
                            <Button size="sm" variant="outline" className="gap-1"><Plus className="w-3 h-3" />הוסף</Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader><DialogTitle>הוסף חבר צוות</DialogTitle></DialogHeader>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-sm font-medium">בחר משתמש</label>
                                    <Select value={selectedUser} onValueChange={setSelectedUser}>
                                        <SelectTrigger className="mt-1"><SelectValue placeholder="בחר משתמש" /></SelectTrigger>
                                        <SelectContent>
                                            {users.filter(u => !members.find(m => m.user_email === u.email)).map(u => (
                                                <SelectItem key={u.email} value={u.email}>{u.full_name || u.email}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                {isProject && (
                                    <div>
                                        <label className="text-sm font-medium">תפקיד</label>
                                        <Select value={selectedRole} onValueChange={setSelectedRole}>
                                            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {roles.map(role => <SelectItem key={role} value={role}>{role}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}
                                <Button onClick={handleAdd} className="w-full">הוסף</Button>
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-2">
                    {members.length === 0 ? (
                        <p className="text-center text-slate-400 py-4 text-sm">אין חברי צוות</p>
                    ) : (
                        members.map(member => (
                            <div key={member.user_email} className="flex items-center justify-between p-3 border border-slate-100 rounded-lg hover:bg-slate-50">
                                <div className="flex items-center gap-3 flex-1">
                                    <Avatar className="h-8 w-8">
                                        <AvatarFallback className="bg-indigo-100 text-indigo-700 text-xs">
                                            {member.user_name?.substring(0, 2).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium truncate">{member.user_name}</p>
                                        <p className="text-xs text-slate-500 truncate">{member.user_email}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {isProject ? (
                                        <Badge className="bg-blue-100 text-blue-700 text-xs">{member.role}</Badge>
                                    ) : null}
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => handleRemove(member.user_email)}
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