import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Plus, TrendingUp } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface CurrencyExposure {
  id: number;
  currency_pair: string;
  exposure_amount: number;
  hedging_strategy: string;
  hedging_cost?: number;
}

interface CommodityRisk {
  id: number;
  commodity_name: string;
  quantity: number;
  current_price: number;
  floor_price: number;
  ceiling_price: number;
  risk_score: number;
}

export default function RiskHedging() {
  const { data: riskhedgingData } = useQuery({
    queryKey: ["risk-hedging"],
    queryFn: () => authFetch("/api/procurement/risk_hedging"),
    staleTime: 5 * 60 * 1000,
  });

  const [exposures, setExposures] = useState<CurrencyExposure[]>([]);
  const [risks, setRisks] = useState<CommodityRisk[]>([]);
  const [riskSummary, setRiskSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [currencyPair, setCurrencyPair] = useState("USD/ILS");
  const [exposureAmount, setExposureAmount] = useState("");
  const [hedgingStrategy, setHedgingStrategy] = useState("none");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [exposuresRes, risksRes, summaryRes] = await Promise.all([
        fetch("/api/currency-exposures", { credentials: "include" }),
        fetch("/api/commodity-risks", { credentials: "include" }),
        fetch("/api/risk-summary", { credentials: "include" }),
      ]);

      if (exposuresRes.ok) setExposures((await exposuresRes.json()).exposures || []);
      if (risksRes.ok) setRisks((await risksRes.json()).risks || []);
      if (summaryRes.ok) setRiskSummary(await summaryRes.json());
    } catch (err) {
      setError("Failed to fetch risk data");
    } finally {
      setLoading(false);
    }
  };

  const addCurrencyExposure = async () => {
    if (!exposureAmount) {
      setError("Exposure amount is required");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/currency-exposures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          currencyPair,
          exposureAmount: parseFloat(exposureAmount),
          hedgingStrategy,
        }),
      });

      if (!res.ok) throw new Error("Failed to add exposure");
      await fetchData();
      setExposureAmount("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error adding exposure");
    } finally {
      setLoading(false);
    }
  };

  const getRiskLevel = (score: number) => {
    if (score <= 3) return { level: "Low", color: "green" };
    if (score <= 6) return { level: "Medium", color: "yellow" };
    return { level: "High", color: "red" };
  };

  const getRiskColor = (score: number) => {
    if (score <= 3) return "bg-green-100 border-green-300";
    if (score <= 6) return "bg-yellow-100 border-yellow-300";
    return "bg-red-100 border-red-300";
  };

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Risk & Hedging Analysis</h1>
        <p className="text-gray-600">Manage currency and commodity risk exposures</p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {riskSummary && (
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Overall Risk Score</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-3xl font-bold text-${getRiskLevel(riskSummary.overallRiskScore).color}-600`}>
                {riskSummary.overallRiskScore}/10
              </p>
              <p className="text-xs text-gray-500 mt-1">{getRiskLevel(riskSummary.overallRiskScore).level} Risk</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Unhedged Currencies</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-orange-600">{riskSummary.unhedgedCurrencies}</p>
              <p className="text-xs text-gray-500 mt-1">Exposures without hedging</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Commodity Risk Avg</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-blue-600">{Math.round(riskSummary.commodityRisks)}/10</p>
              <p className="text-xs text-gray-500 mt-1">Average across commodities</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Active Exposures</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{exposures.length}</p>
              <p className="text-xs text-gray-500 mt-1">Currency + commodity</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Currency Exposures</CardTitle>
              <CardDescription>Manage forex hedging strategies</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Dialog>
                <DialogTrigger asChild>
                  <Button className="w-full">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Exposure
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Currency Exposure</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Currency Pair</label>
                      <select
                        className="w-full border rounded px-3 py-2 mt-1"
                        value={currencyPair}
                        onChange={(e) => setCurrencyPair(e.target.value)}
                      >
                        <option value="USD/ILS">USD/ILS</option>
                        <option value="EUR/ILS">EUR/ILS</option>
                        <option value="CNY/ILS">CNY/ILS</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Exposure Amount (₪)</label>
                      <Input
                        type="number"
                        placeholder="0.00"
                        value={exposureAmount}
                        onChange={(e) => setExposureAmount(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Hedging Strategy</label>
                      <select
                        className="w-full border rounded px-3 py-2 mt-1"
                        value={hedgingStrategy}
                        onChange={(e) => setHedgingStrategy(e.target.value)}
                      >
                        <option value="none">None</option>
                        <option value="forward">Forward Contract</option>
                        <option value="option">Option</option>
                      </select>
                    </div>
                    <Button onClick={addCurrencyExposure} disabled={loading} className="w-full">
                      Add Exposure
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              <div className="space-y-2">
                {exposures.map((exp) => (
                  <div key={exp.id} className="p-3 border rounded hover:bg-gray-50">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-medium">{exp.currency_pair}</p>
                        <p className="text-sm text-gray-600">₪{(exp.exposure_amount || 0).toLocaleString()}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                          {exp.hedging_strategy || "None"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Commodity Risks</CardTitle>
              <CardDescription>Track raw material price exposures</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {risks.map((risk) => {
                const riskLevelInfo = getRiskLevel(risk.risk_score);
                return (
                  <div key={risk.id} className={`p-3 border rounded ${getRiskColor(risk.risk_score)}`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">{risk.commodity_name}</p>
                        <p className="text-xs text-gray-600 mt-1">
                          Qty: {risk.quantity} | Current: ₪{(risk.current_price || 0).toFixed(2)}
                        </p>
                        <p className="text-xs text-gray-600">
                          Range: ₪{(risk.floor_price || 0).toFixed(2)} - ₪{(risk.ceiling_price || 0).toFixed(2)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-bold text-${riskLevelInfo.color}-700`}>
                          {risk.risk_score}/10
                        </p>
                        <p className="text-xs text-gray-600">{riskLevelInfo.level} Risk</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hedging Recommendations</CardTitle>
          <CardDescription>Suggested actions to manage risk</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {riskSummary && riskSummary.unhedgedCurrencies > 0 && (
            <Alert className="border-orange-200 bg-orange-50">
              <AlertCircle className="h-4 w-4 text-orange-600" />
              <AlertDescription className="text-orange-800">
                <p className="font-semibold">Unhedged Currency Risk</p>
                <p className="text-sm mt-1">
                  Consider hedging {riskSummary.unhedgedCurrencies} currency exposures using forward contracts or options
                </p>
              </AlertDescription>
            </Alert>
          )}
          <Alert className="border-blue-200 bg-blue-50">
            <TrendingUp className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              <p className="font-semibold">Commodity Price Volatility</p>
              <p className="text-sm mt-1">Monitor commodity prices closely and consider price-fixing agreements with suppliers</p>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
