import { useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, AreaChart, Area,
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

export default function ReportVisualizer({ data, fields, visualization, groupBy }) {
  const chartConfig = useMemo(() => {
    if (!data || data.length === 0) return null;

    let chartData = data;

    // Group data if needed
    if (groupBy) {
      const grouped = {};
      data.forEach(item => {
        const key = item[groupBy];
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(item);
      });

      chartData = Object.entries(grouped).map(([key, items]) => ({
        name: key,
        count: items.length,
        ...items.reduce((acc, item) => {
          Object.entries(item).forEach(([k, v]) => {
            if (k !== groupBy && typeof v === 'number') {
              acc[k] = (acc[k] || 0) + v;
            }
          });
          return acc;
        }, {})
      }));
    }

    return chartData;
  }, [data, groupBy]);

  if (!chartConfig || chartConfig.length === 0) {
    return (
      <Card className="border-0 shadow-sm bg-slate-50">
        <CardContent className="p-8 text-center">
          <p className="text-slate-600">No data to visualize</p>
        </CardContent>
      </Card>
    );
  }

  const numericFields = fields.filter(f => f.field_type === 'number' || f.field_type === 'currency').map(f => f.key);
  const valueKey = numericFields[0] || 'count';

  const renderChart = () => {
    const commonProps = {
      data: chartConfig,
      margin: { top: 20, right: 30, left: 0, bottom: 20 }
    };

    switch (visualization) {
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart {...commonProps}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey={valueKey} fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        );
      case 'line':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart {...commonProps}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey={valueKey} stroke="#3b82f6" />
            </LineChart>
          </ResponsiveContainer>
        );
      case 'pie':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <PieChart>
              <Pie data={chartConfig} dataKey={valueKey} nameKey="name" label>
                {chartConfig.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        );
      case 'area':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <AreaChart {...commonProps}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey={valueKey} fill="#3b82f6" stroke="#3b82f6" />
            </AreaChart>
          </ResponsiveContainer>
        );
      case 'scatter':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <ScatterChart {...commonProps}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Scatter dataKey={valueKey} fill="#3b82f6" />
            </ScatterChart>
          </ResponsiveContainer>
        );
      default:
        return null;
    }
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Visualization</CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        {renderChart()}
      </CardContent>
    </Card>
  );
}