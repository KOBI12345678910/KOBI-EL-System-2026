import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Plus, AlertCircle, TrendingDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Competitor {
  id: number;
  name: string;
  category: string;
  market_share: number;
  status: string;
}

export default function CompetitorAnalysis() {
  const { data: competitoranalysisData } = useQuery({
    queryKey: ["competitor-analysis"],
    queryFn: () => authFetch("/api/procurement/competitor_analysis"),
    staleTime: 5 * 60 * 1000,
  });

  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(false);
  const [newCompetitor, setNewCompetitor] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCompetitors();
  }, []);

  const fetchCompetitors = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/competitors", {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setCompetitors(data.competitors || []);
      }
    } catch (err) {
      setError("Failed to fetch competitors");
    } finally {
      setLoading(false);
    }
  };

  const addCompetitor = async () => {
    if (!newCompetitor.trim()) {
      setError("Competitor name is required");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: newCompetitor, category: "", marketShare: 0 }),
      });

      if (!res.ok) throw new Error("Failed to add competitor");
      await fetchCompetitors();
      setNewCompetitor("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error adding competitor");
    } finally {
      setLoading(false);
    }
  };

  const mockPriceData = [
    { category: "Product A", us: 100, competitor1: 95, competitor2: 105, avg: 100 },
    { category: "Product B", us: 80, competitor1: 85, competitor2: 78, avg: 81 },
    { category: "Product C", us: 150, competitor1: 140, competitor2: 160, avg: 150 },
    { category: "Product D", us: 120, competitor1: 130, competitor2: 115, avg: 122 },
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Competitor Analysis</h1>
        <p className="text-gray-600">Track competitor pricing and market positioning</p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Dialog>
        <DialogTrigger asChild>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Competitor
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Competitor</DialogTitle>
            <DialogDescription>Track a new competitor in your market</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Competitor name"
              value={newCompetitor}
              onChange={(e) => setNewCompetitor(e.target.value)}
            />
            <Button onClick={addCompetitor} disabled={loading} className="w-full">
              Add Competitor
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>Price Comparison by Category</CardTitle>
          <CardDescription>Our prices vs. competitor average</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={mockPriceData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="category" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="us" fill="#3b82f6" name="Our Price" />
              <Bar dataKey="competitor1" fill="#ef4444" name="Competitor 1" />
              <Bar dataKey="competitor2" fill="#f59e0b" name="Competitor 2" />
              <Bar dataKey="avg" fill="#6b7280" name="Market Avg" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Competitiveness Score</CardTitle>
            <CardDescription>% of products below average</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">65%</p>
            <p className="text-sm text-gray-600 mt-2">Good competitive position</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Price Warnings</CardTitle>
            <CardDescription>Products 10%+ above average</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-red-600">3</p>
            <p className="text-sm text-gray-600 mt-2">Requires attention</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tracked Competitors</CardTitle>
          <CardDescription>{competitors.length} competitors in your database</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {competitors.map((comp) => (
              <div key={comp.id} className="flex items-center justify-between p-3 border rounded hover:bg-gray-50">
                <div>
                  <p className="font-medium">{comp.name}</p>
                  {comp.market_share && <p className="text-sm text-gray-600">{comp.market_share}% market share</p>}
                </div>
                <Button variant="ghost" size="sm">
                  View Details
                </Button>
              </div>
            ))}
            {competitors.length === 0 && (
              <p className="text-center text-gray-500 py-4">No competitors tracked yet</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
