import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mail, Eye, MousePointerClick, TrendingUp } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { entityList } from "@/lib/entity-api";

export default function EmailAnalyticsDashboard() {
  const [analytics, setAnalytics] = useState([]);
  const [stats, setStats] = useState({
    total_sent: 0,
    total_opened: 0,
    total_clicked: 0,
    avg_open_rate: 0,
    avg_click_rate: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const data = await entityList<any>("email-analytics", '-sent_at', 100);
      setAnalytics(data);

      // Calculate stats
      const totalSent = data.length;
      const totalOpened = data.filter(e => e.opened).length;
      const totalClicked = data.filter(e => (e.links_clicked?.length || 0) > 0).length;

      setStats({
        total_sent: totalSent,
        total_opened: totalOpened,
        total_clicked: totalClicked,
        avg_open_rate: totalSent > 0 ? ((totalOpened / totalSent) * 100).toFixed(1) : 0,
        avg_click_rate: totalSent > 0 ? ((totalClicked / totalSent) * 100).toFixed(1) : 0
      });
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const chartData = [
    { name: 'Sent', value: stats.total_sent },
    { name: 'Opened', value: stats.total_opened },
    { name: 'Clicked', value: stats.total_clicked }
  ];

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b'];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Mail className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-slate-600">Total Sent</p>
                <p className="text-2xl font-bold text-slate-900">{stats.total_sent}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Eye className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-slate-600">Open Rate</p>
                <p className="text-2xl font-bold text-slate-900">{stats.avg_open_rate}%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <MousePointerClick className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-slate-600">Click Rate</p>
                <p className="text-2xl font-bold text-slate-900">{stats.avg_click_rate}%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <TrendingUp className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-slate-600">Engagement</p>
                <p className="text-2xl font-bold text-slate-900">{(((stats.total_opened + stats.total_clicked) / (stats.total_sent || 1)) * 100).toFixed(1)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Email Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value}`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {COLORS.map((color, index) => (
                  <Cell key={`cell-${index}`} fill={color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Recent Emails</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {loading ? (
              <p className="text-slate-600 text-center py-4">Loading...</p>
            ) : analytics.length === 0 ? (
              <p className="text-slate-600 text-center py-4">No email analytics yet</p>
            ) : (
              analytics.slice(0, 10).map(email => (
                <div key={email.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50">
                  <div className="flex-1">
                    <p className="font-medium text-slate-900 text-sm">{email.subject}</p>
                    <p className="text-xs text-slate-600 mt-1">{email.recipient}</p>
                  </div>
                  <div className="flex gap-2">
                    {email.opened && <Badge className="bg-green-100 text-green-800 text-xs">Opened {email.open_count}x</Badge>}
                    {email.links_clicked?.length > 0 && <Badge className="bg-orange-100 text-orange-800 text-xs">Clicked {email.links_clicked.length}</Badge>}
                    {!email.opened && <Badge variant="outline" className="text-xs">Unopened</Badge>}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}