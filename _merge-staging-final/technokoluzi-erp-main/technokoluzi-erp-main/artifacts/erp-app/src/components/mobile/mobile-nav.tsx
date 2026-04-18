import { Link } from "wouter";
import { createPageUrl } from "@/lib/route-map";
import { 
    LayoutDashboard, Users, ShoppingCart, Factory, 
    Settings, Plus, Bell, Home 
} from 'lucide-react';

export default function MobileNav() {
    const navItems = [
        { icon: Home, label: 'בית', page: 'Dashboard' },
        { icon: Users, label: 'CRM', page: 'CRMDashboard' },
        { icon: ShoppingCart, label: 'מכירות', page: 'SalesOrders' },
        { icon: Factory, label: 'ייצור', page: 'ProductionOrders' },
        { icon: Bell, label: 'התראות', page: 'NotificationLog' },
        { icon: Settings, label: 'הגדרות', page: 'SystemSettings' }
    ];

    return (
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 h-16 flex items-center justify-around md:hidden z-40">
            {navItems.map(item => (
                <Link
                    key={item.page}
                    to={createPageUrl(item.page)}
                    className="flex flex-col items-center justify-center w-full h-full hover:bg-slate-50 transition-colors"
                >
                    <item.icon className="w-5 h-5 text-slate-600 mb-1" />
                    <span className="text-xs text-slate-600">{item.label}</span>
                </Link>
            ))}
        </nav>
    );
}