import { useState } from "react";
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { entityList } from "@/lib/entity-api";

export default function ProfitabilityAnalysis() {
    const { data: jobCosts = [] } = useQuery({
        queryKey: ['job_costs'],
        queryFn: () => entityList<any>("job-costs")
    });

    const { data: customers = [] } = useQuery({
        queryKey: ['customers'],
        queryFn: () => entityList<any>("customers")
    });

    // By Customer
    const customerProfitability = customers.map(customer => {
        const customerJobs = jobCosts.filter(j => j.customer_name === customer.name);
        const revenue = customerJobs.reduce((sum, j) => sum + (j.revenue || 0), 0);
        const profit = customerJobs.reduce((sum, j) => sum + (j.gross_profit || 0), 0);
        const margin = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : 0;
        return {
            name: customer.name,
            revenue,
            profit,
            margin: parseFloat(margin)
        };
    }).filter(c => c.revenue > 0).sort((a, b) => b.profit - a.profit).slice(0, 10);

    // By Product
    const productProfitability = jobCosts.reduce((acc, job) => {
        if (!job.product_name) return acc;
        if (!acc[job.product_name]) {
            acc[job.product_name] = { revenue: 0, profit: 0, count: 0 };
        }
        acc[job.product_name].revenue += job.revenue || 0;
        acc[job.product_name].profit += job.gross_profit || 0;
        acc[job.product_name].count += 1;
        return acc;
    }, {});

    const productData = Object.entries(productProfitability).map(([name, data]) => ({
        name,
        revenue: data.revenue,
        profit: data.profit,
        margin: data.revenue > 0 ? ((data.profit / data.revenue) * 100).toFixed(1) : 0,
        count: data.count
    })).sort((a, b) => b.profit - a.profit).slice(0, 10);

    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

    return (
        <div className="space-y-6">
            <Tabs defaultValue="customer" className="space-y-4">
                <TabsList className="grid grid-cols-2 w-full max-w-md">
                    <TabsTrigger value="customer">לפי לקוח</TabsTrigger>
                    <TabsTrigger value="product">לפי מוצר</TabsTrigger>
                </TabsList>

                <TabsContent value="customer" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>רווחיות לפי לקוח - Top 10</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ResponsiveContainer width="100%" height={400}>
                                <BarChart data={customerProfitability}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                                    <YAxis />
                                    <Tooltip />
                                    <Legend />
                                    <Bar dataKey="revenue" fill="#3b82f6" name="הכנסה" />
                                    <Bar dataKey="profit" fill="#10b981" name="רווח" />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>שולי רווח לפי לקוח</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {customerProfitability.map((customer, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                        <div className="flex-1">
                                            <div className="font-medium">{customer.name}</div>
                                            <div className="text-sm text-slate-600">
                                                הכנסה: ₪{customer.revenue.toLocaleString()} | רווח: ₪{customer.profit.toLocaleString()}
                                            </div>
                                        </div>
                                        <div className="text-2xl font-bold text-indigo-600">
                                            {customer.margin}%
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="product" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>רווחיות לפי מוצר - Top 10</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ResponsiveContainer width="100%" height={400}>
                                <BarChart data={productData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                                    <YAxis />
                                    <Tooltip />
                                    <Legend />
                                    <Bar dataKey="revenue" fill="#8b5cf6" name="הכנסה" />
                                    <Bar dataKey="profit" fill="#10b981" name="רווח" />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>התפלגות הכנסות</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ResponsiveContainer width="100%" height={300}>
                                    <PieChart>
                                        <Pie
                                            data={productData.slice(0, 8)}
                                            cx="50%"
                                            cy="50%"
                                            labelLine={false}
                                            label={(entry) => entry.name}
                                            outerRadius={80}
                                            fill="#8884d8"
                                            dataKey="revenue"
                                        >
                                            {productData.slice(0, 8).map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                    </PieChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>שולי רווח לפי מוצר</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    {productData.map((product, idx) => (
                                        <div key={idx} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded">
                                            <span className="text-sm font-medium">{product.name}</span>
                                            <span className="text-lg font-bold text-indigo-600">
                                                {product.margin}%
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}