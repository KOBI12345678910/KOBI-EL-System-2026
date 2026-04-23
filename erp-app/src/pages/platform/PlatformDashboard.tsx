import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Building2, Users, Globe2, TrendingUp, DollarSign, Activity, Zap, Shield, Star, ArrowUpRight, BarChart2, CheckCircle2, Package } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type PlatformOrg = { id: string; org_name: string; status: string; country: string; current_end_users: number; };
type PlatformModule = { id: string; module_code: string; module_name: string; module_name_en: string; category: string; color: string; is_beta: boolean; sort_order: number; };
type PlatformPlan = { id: string; plan_code: string; plan_name: string; plan_name_en: string; price_monthly: number; price_yearly: number; max_end_users: number; };

const PLAN_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

function StatCard({ title, value, subtitle, icon: Icon, trend, bg }: {
    title: string; value: string; subtitle?: string; icon: React.ElementType; trend?: number; bg: string;
}) {
    return (
          <Card className="border-0 shadow-lg overflow-hidden">
                <CardContent className="p-6">
                        <div className="flex items-start justify-between">
                                  <div>
                                              <p className="text-sm font-medium text-gray-500">{title}</p>p>
                                              <p className="text-3xl font-bold mt-1 text-gray-900">{value}</p>p>
                                    {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>p>}
                                  </div>div>
                                  <div className={`p-3 rounded-xl ${bg}`}>
                                              <Icon className="w-6 h-6 text-white" />
                                  </div>div>
                        </div>div>
                  {trend !== undefined && (
                      <div className="flex items-center mt-3 gap-1">
                                  <ArrowUpRight className="w-4 h-4 text-green-500" />
                                  <span className="text-sm text-green-600 font-semibold">+{trend}%</span>span>
                                  <span className="text-xs text-gray-400 ml-1">vs last month</span>span>
                      </div>div>
                        )}
                </CardContent>CardContent>
          </Card>Card>
        );
}

export default function PlatformDashboard() {
    const [orgs, setOrgs] = useState<PlatformOrg[]>([]);
    const [modules, setModules] = useState<PlatformModule[]>([]);
    const [plans, setPlans] = useState<PlatformPlan[]>([]);
    const [loading, setLoading] = useState(true);
  
    useEffect(() => {
          (async () => {
                  setLoading(true);
                  const [o, m, p] = await Promise.all([
                            supabase.from('platform_organizations').select('*').order('created_at', { ascending: false }).limit(20),
                            supabase.from('platform_modules').select('*').order('sort_order'),
                            supabase.from('platform_plans').select('*').order('price_monthly'),
                          ]);
                  setOrgs(o.data || []);
                  setModules(m.data || []);
                  setPlans(p.data || []);
                  setLoading(false);
          })();
    }, []);
  
    const chartData = [
      { day: 'Mon', revenue: 248000 }, { day: 'Tue', revenue: 267000 },
      { day: 'Wed', revenue: 259000 }, { day: 'Thu', revenue: 289000 },
      { day: 'Fri', revenue: 301000 }, { day: 'Sat', revenue: 278000 },
      { day: 'Sun', revenue: 312000 },
        ];
  
    const planDist = plans.map((p, i) => ({
          name: p.plan_name_en || p.plan_code,
          value: [1200, 980, 540, 220, 60][i] || 100,
          color: PLAN_COLORS[i % PLAN_COLORS.length],
    }));
  
    if (loading) {
          return (
                  <div className="flex items-center justify-center h-96">
                          <div className="text-center">
                                    <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                                    <p className="text-gray-500 text-lg font-medium">Loading Platform...</p>p>
                          </div>div>
                  </div>div>
                );
    }
  
    return (
          <div className="p-6 bg-gray-50 min-h-screen" dir="ltr">
            {/* Header */}
                <div className="mb-8 flex items-start justify-between flex-wrap gap-4">
                        <div>
                                  <div className="flex items-center gap-3 mb-2">
                                              <div className="p-2.5 bg-gradient-to-br from-blue-600 to-purple-700 rounded-2xl shadow-lg">
                                                            <Globe2 className="w-8 h-8 text-white" />
                                              </div>div>
                                              <div>
                                                            <h1 className="text-3xl font-bold text-gray-900">Global Business Platform</h1>h1>
                                                            <p className="text-gray-500 text-sm">3,000 Businesses &middot; 3 Billion End Users &middot; 195 Countries</p>p>
                                              </div>div>
                                  </div>div>
                                  <div className="flex gap-2 mt-3 flex-wrap">
                                              <Badge className="bg-green-100 text-green-800 border-0 gap-1 text-xs">
                                                            <CheckCircle2 className="w-3 h-3" /> Online
                                              </Badge>Badge>
                                              <Badge className="bg-blue-100 text-blue-800 border-0 gap-1 text-xs">
                                                            <Activity className="w-3 h-3" /> 99.99% Uptime
                                              </Badge>Badge>
                                              <Badge className="bg-purple-100 text-purple-800 border-0 gap-1 text-xs">
                                                            <Shield className="w-3 h-3" /> SOC2 Compliant
                                              </Badge>Badge>
                                  </div>div>
                        </div>div>
                        <Button className="bg-gradient-to-r from-blue-600 to-purple-600 text-white border-0 shadow-lg gap-2">
                                  <Zap className="w-4 h-4" /> Add Business
                        </Button>Button>
                </div>div>
          
            {/* KPI Cards */}
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
                        <StatCard title="Registered Businesses" value="3,000" subtitle="2,850 active 150 trial" icon={Building2} trend={12} bg="bg-blue-600" />
                        <StatCard title="Global End Users" value="3B+" subtitle="Across all platforms" icon={Users} trend={23} bg="bg-emerald-600" />
                        <StatCard title="Countries" value="195" subtitle="Global deployment" icon={Globe2} trend={8} bg="bg-purple-600" />
                        <StatCard title="Monthly Revenue" value="$2.4M" subtitle="Platform MRR" icon={DollarSign} trend={18} bg="bg-orange-600" />
                </div>div>
          
            {/* Charts */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
                        <Card className="xl:col-span-2 border-0 shadow-lg">
                                  <CardHeader>
                                              <CardTitle className="flex items-center gap-2 text-base">
                                                            <TrendingUp className="w-5 h-5 text-blue-500" />
                                                            Platform Revenue (7 Days)
                                              </CardTitle>CardTitle>
                                  </CardHeader>CardHeader>
                                  <CardContent>
                                              <ResponsiveContainer width="100%" height={220}>
                                                            <AreaChart data={chartData}>
                                                                            <defs>
                                                                                              <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                                                                                                                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                                                                                                                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                                                                                                </linearGradient>linearGradient>
                                                                            </defs>defs>
                                                                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                                                            <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                                                                            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                                                                            <Tooltip formatter={(v: number) => [`$${v.toLocaleString()}`, 'Revenue']} />
                                                                            <Area type="monotone" dataKey="revenue" stroke="#3B82F6" strokeWidth={2.5} fill="url(#revGrad)" />
                                                            </AreaChart>AreaChart>
                                              </ResponsiveContainer>ResponsiveContainer>
                                  </CardContent>CardContent>
                        </Card>Card>
                
                        <Card className="border-0 shadow-lg">
                                  <CardHeader>
                                              <CardTitle className="flex items-center gap-2 text-base">
                                                            <BarChart2 className="w-5 h-5 text-purple-500" />
                                                            Plan Distribution
                                              </CardTitle>CardTitle>
                                  </CardHeader>CardHeader>
                                  <CardContent>
                                              <ResponsiveContainer width="100%" height={160}>
                                                            <PieChart>
                                                                            <Pie data={planDist} dataKey="value" cx="50%" cy="50%" outerRadius={65} strokeWidth={2}>
                                                                              {planDist.map((e, i) => <Cell key={i} fill={e.color} />)}
                                                                            </Pie>Pie>
                                                                            <Tooltip />
                                                            </PieChart>PieChart>
                                              </ResponsiveContainer>ResponsiveContainer>
                                              <div className="space-y-2 mt-3">
                                                {planDist.map((item, i) => (
                            <div key={i} className="flex items-center justify-between text-sm">
                                              <div className="flex items-center gap-2">
                                                                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                                                                  <span className="text-gray-600">{item.name}</span>span>
                                              </div>div>
                                              <span className="font-semibold text-gray-800">{item.value.toLocaleString()}</span>span>
                            </div>div>
                          ))}
                                              </div>div>
                                  </CardContent>CardContent>
                        </Card>Card>
                </div>div>
          
            {/* Modules + Plans Grid */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
                        <Card className="border-0 shadow-lg">
                                  <CardHeader>
                                              <CardTitle className="flex items-center gap-2 text-base">
                                                            <Package className="w-5 h-5 text-emerald-500" />
                                                            Platform Modules ({modules.length})
                                              </CardTitle>CardTitle>
                                  </CardHeader>CardHeader>
                                  <CardContent>
                                              <div className="grid grid-cols-2 gap-2">
                                                {modules.map((mod) => (
                            <div key={mod.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-blue-50 transition-colors cursor-pointer group">
                                              <div
                                                                    className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                                                                    style={{ backgroundColor: mod.color || '#3B82F6' }}
                                                                  >
                                                {(mod.module_name_en || mod.module_name || '?')[0]}
                                              </div>div>
                                              <div className="flex-1 min-w-0">
                                                                  <p className="text-sm font-semibold text-gray-800 truncate group-hover:text-blue-700">
                                                                    {mod.module_name_en || mod.module_name}
                                                                  </p>p>
                                                                  <p className="text-xs text-gray-400 capitalize">{mod.category}</p>p>
                                              </div>div>
                              {mod.is_beta && (
                                                  <Badge className="text-xs bg-amber-100 text-amber-700 border-0 px-1">beta</Badge>Badge>
                                              )}
                            </div>div>
                          ))}
                                              </div>div>
                                  </CardContent>CardContent>
                        </Card>Card>
                
                        <Card className="border-0 shadow-lg">
                                  <CardHeader>
                                              <CardTitle className="flex items-center gap-2 text-base">
                                                            <Star className="w-5 h-5 text-amber-500" />
                                                            Subscription Plans ({plans.length})
                                              </CardTitle>CardTitle>
                                  </CardHeader>CardHeader>
                                  <CardContent>
                                              <div className="space-y-3">
                                                {plans.map((plan, i) => (
                            <div
                                                key={plan.id}
                                                className="flex items-center justify-between p-4 rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50 transition-all cursor-pointer"
                                              >
                                              <div className="flex items-center gap-3">
                                                                  <div
                                                                                          className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold"
                                                                                          style={{ backgroundColor: PLAN_COLORS[i % PLAN_COLORS.length] }}
                                                                                        >
                                                                    {(plan.plan_name_en || plan.plan_code)[0].toUpperCase()}
                                                                  </div>div>
                                                                  <div>
                                                                                        <p className="font-semibold text-gray-800">{plan.plan_name_en || plan.plan_code}</p>p>
                                                                                        <p className="text-xs text-gray-400">
                                                                                                                Up to {(plan.max_end_users || 0).toLocaleString()} end users
                                                                                          </p>p>
                                                                  </div>div>
                                              </div>div>
                                              <div className="text-right">
                                                                  <p className="font-bold text-gray-900">${plan.price_monthly}/mo</p>p>
                                                                  <p className="text-xs text-emerald-600">${plan.price_yearly}/yr</p>p>
                                              </div>div>
                            </div>div>
                          ))}
                                              </div>div>
                                  </CardContent>CardContent>
                        </Card>Card>
                </div>div>
          
            {/* Organizations */}
                <Card className="border-0 shadow-lg">
                        <CardHeader className="flex flex-row items-center justify-between">
                                  <CardTitle className="flex items-center gap-2 text-base">
                                              <Building2 className="w-5 h-5 text-blue-500" />
                                              Registered Businesses ({orgs.length})
                                  </CardTitle>CardTitle>
                                  <Button variant="outline" size="sm" className="gap-2 border-blue-200 text-blue-600 hover:bg-blue-50">
                                              <Zap className="w-4 h-4" /> Register Business
                                  </Button>Button>
                        </CardHeader>CardHeader>
                        <CardContent>
                          {orgs.length === 0 ? (
                        <div className="text-center py-16">
                                      <Building2 className="w-20 h-20 mx-auto mb-4 text-gray-200" />
                                      <p className="text-xl font-semibold text-gray-500">Ready for 3,000 Businesses</p>p>
                                      <p className="text-sm text-gray-400 mt-2 max-w-sm mx-auto">
                                                      The platform database is live with multi-tenant isolation.
                                                      Register your first business to get started.
                                      </p>p>
                                      <Button className="mt-6 bg-gradient-to-r from-blue-600 to-purple-600 text-white border-0 shadow-lg">
                                                      Register First Business
                                      </Button>Button>
                        </div>div>
                      ) : (
                        <div className="space-y-2">
                          {orgs.map((org) => (
                                          <div
                                                              key={org.id}
                                                              className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-white hover:shadow-md transition-all cursor-pointer"
                                                            >
                                                            <div className="flex items-center gap-4">
                                                                                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center text-white font-bold">
                                                                                  {org.org_name[0]}
                                                                                  </div>div>
                                                                                <div>
                                                                                                      <p className="font-semibold text-gray-800">{org.org_name}</p>p>
                                                                                                      <p className="text-sm text-gray-400">
                                                                                                        {org.country} &middot; {(org.current_end_users || 0).toLocaleString()} end users
                                                                                                        </p>p>
                                                                                  </div>div>
                                                            </div>div>
                                                            <div className="flex items-center gap-3">
                                                                                <Badge
                                                                                                        className={`text-xs border-0 ${
                                                                                                                                  org.status === 'active' ? 'bg-green-100 text-green-800' :
                                                                                                                                  org.status === 'trial' ? 'bg-blue-100 text-blue-800' :
                                                                                                                                  'bg-gray-100 text-gray-600'
                                                                                                          }`}
                                                                                                      >
                                                                                  {org.status}
                                                                                  </Badge>Badge>
                                                                                <ArrowUpRight className="w-4 h-4 text-gray-300" />
                                                            </div>div>
                                          </div>div>
                                        ))}
                        </div>div>
                                  )}
                        </CardContent>CardContent>
                </Card>Card>
          </div>div>
        );
}</Card>
