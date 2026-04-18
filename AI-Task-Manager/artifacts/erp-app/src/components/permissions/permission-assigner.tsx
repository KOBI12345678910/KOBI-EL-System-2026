import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, Plus, Trash2 } from 'lucide-react';

const MODULES = [
    { name: 'CRM', permissions: ['read', 'create', 'update', 'delete', 'export'] },
    { name: 'Sales', permissions: ['read', 'create', 'update', 'delete', 'approve'] },
    { name: 'Production', permissions: ['read', 'create', 'update', 'delete', 'manage_schedule'] },
    { name: 'Inventory', permissions: ['read', 'create', 'update', 'delete', 'transfer'] },
    { name: 'Finance', permissions: ['read', 'create', 'update', 'delete', 'approve', 'reconcile'] },
    { name: 'HR', permissions: ['read', 'create', 'update', 'delete', 'manage_attendance'] },
    { name: 'Reports', permissions: ['read', 'create', 'delete', 'share'] },
    { name: 'Settings', permissions: ['read', 'create', 'update', 'delete', 'manage_users'] },
];

export default function PermissionAssigner({ role, onPermissionsChange }) {
    const [expandedModules, setExpandedModules] = useState({});
    const [permissions, setPermissions] = useState(role?.permissions || []);

    const toggleModule = (moduleName) => {
        setExpandedModules(prev => ({
            ...prev,
            [moduleName]: !prev[moduleName]
        }));
    };

    const togglePermission = (module, action) => {
        setPermissions(prev => {
            const existingModule = prev.find(p => p.module === module);
            if (!existingModule) {
                return [...prev, { module, entity: module, actions: [action] }];
            }

            if (existingModule.actions.includes(action)) {
                if (existingModule.actions.length === 1) {
                    return prev.filter(p => p.module !== module);
                }
                return prev.map(p => 
                    p.module === module
                        ? { ...p, actions: p.actions.filter(a => a !== action) }
                        : p
                );
            } else {
                return prev.map(p => 
                    p.module === module
                        ? { ...p, actions: [...p.actions, action] }
                        : p
                );
            }
        });
    };

    const toggleModuleAll = (module, modulePermissions) => {
        const existingModule = permissions.find(p => p.module === module);
        const hasAll = existingModule?.actions?.length === modulePermissions.length;

        if (hasAll) {
            setPermissions(prev => prev.filter(p => p.module !== module));
        } else {
            setPermissions(prev => {
                const filtered = prev.filter(p => p.module !== module);
                return [...filtered, { module, entity: module, actions: modulePermissions }];
            });
        }
    };

    const removeModule = (module) => {
        setPermissions(prev => prev.filter(p => p.module !== module));
    };

    React.useEffect(() => {
        onPermissionsChange(permissions);
    }, [permissions, onPermissionsChange]);

    return (
        <div className="space-y-4">
            {MODULES.map(module => {
                const modulePermissions = permissions.find(p => p.module === module.name);
                const isExpanded = expandedModules[module.name];
                const allGranted = modulePermissions?.actions?.length === module.permissions.length;

                return (
                    <Card key={module.name} className="border-0 shadow-sm">
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <button
                                    onClick={() => toggleModule(module.name)}
                                    className="flex items-center gap-2 flex-1 text-right"
                                >
                                    <ChevronDown 
                                        className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                    />
                                    <CardTitle className="text-sm font-semibold">{module.name}</CardTitle>
                                </button>
                                {modulePermissions && (
                                    <Badge className="bg-blue-100 text-blue-800 text-xs">
                                        {modulePermissions.actions.length} הרשאות
                                    </Badge>
                                )}
                            </div>
                        </CardHeader>

                        {isExpanded && (
                            <CardContent className="space-y-4 pt-0">
                                <div className="space-y-3">
                                    <button
                                        onClick={() => toggleModuleAll(module.name, module.permissions)}
                                        className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 text-right"
                                    >
                                        <Checkbox 
                                            checked={allGranted}
                                            readOnly
                                        />
                                        <span className="font-medium text-slate-900 flex-1">
                                            כל ההרשאות
                                        </span>
                                    </button>

                                    <div className="mr-3 space-y-2 border-t pt-3">
                                        {module.permissions.map(action => {
                                            const isChecked = modulePermissions?.actions?.includes(action);
                                            return (
                                                <button
                                                    key={action}
                                                    onClick={() => togglePermission(module.name, action)}
                                                    className="w-full flex items-center gap-3 p-2 rounded hover:bg-slate-50 text-right"
                                                >
                                                    <Checkbox 
                                                        checked={isChecked}
                                                        readOnly
                                                    />
                                                    <span className="text-sm text-slate-700 flex-1 capitalize">
                                                        {action === 'read' && 'קריאה'}
                                                        {action === 'create' && 'יצירה'}
                                                        {action === 'update' && 'עריכה'}
                                                        {action === 'delete' && 'מחיקה'}
                                                        {action === 'export' && 'ייצוא'}
                                                        {action === 'approve' && 'אישור'}
                                                        {action === 'manage_schedule' && 'ניהול לוח זמנים'}
                                                        {action === 'transfer' && 'העברה'}
                                                        {action === 'reconcile' && 'התאמה'}
                                                        {action === 'manage_attendance' && 'ניהול נוכחות'}
                                                        {action === 'share' && 'שיתוף'}
                                                        {action === 'manage_users' && 'ניהול משתמשים'}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {modulePermissions && (
                                    <div className="pt-3 border-t">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => removeModule(module.name)}
                                            className="w-full text-red-600 hover:text-red-700 gap-2"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                            הסר את כל ההרשאות
                                        </Button>
                                    </div>
                                )}
                            </CardContent>
                        )}
                    </Card>
                );
            })}
        </div>
    );
}