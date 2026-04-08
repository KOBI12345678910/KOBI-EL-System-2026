import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, TrendingDown, AlertCircle } from "lucide-react";

interface PaymentDecision {
  invoiceAmount: number;
  squareMeters: number;
  ratePerSqm: number;
  contractorPercentage: number;
  paymentByPercentage: number;
  paymentBySqm: number;
  difference: number;
  recommendation: "percentage" | "sqm";
  savings: number;
}

interface Summary {
  totalDecisions: number;
  totalSavings: number;
  methodBreakdown: Array<{ recommendation: string; count: number }>;
}

export default function ContractorPaymentDecisionModel() {
  const { data: contractorpaymentdecisionmodelData } = useQuery({
    queryKey: ["contractor-payment-decision-model"],
    queryFn: () => authFetch("/api/finance/contractor_payment_decision_model"),
    staleTime: 5 * 60 * 1000,
  });

  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [squareMeters, setSquareMeters] = useState("");
  const [ratePerSqm, setRatePerSqm] = useState("");
  const [contractorPercentage, setContractorPercentage] = useState("15");
  const [decision, setDecision] = useState<PaymentDecision | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSummary();
  }, []);

  const fetchSummary = async () => {
    try {
      const res = await fetch("/api/contractor-payment/summary", {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } catch (err) {
      console.error("Failed to fetch summary:", err);
    }
  };

  const calculateDecision = async () => {
    if (!invoiceAmount || !squareMeters || !ratePerSqm) {
      setError("Please fill in all fields");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/contractor-payment/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          invoiceAmount: parseFloat(invoiceAmount),
          squareMeters: parseFloat(squareMeters),
          ratePerSqm: parseFloat(ratePerSqm),
          contractorPercentage: parseFloat(contractorPercentage),
        }),
      });

      if (!res.ok) throw new Error("Failed to calculate");
      const data = await res.json();
      setDecision(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Calculation failed");
    } finally {
      setLoading(false);
    }
  };

  const saveDecision = async (chosenMethod: "percentage" | "sqm") => {
    if (!decision) return;

    setLoading(true);
    try {
      const res = await fetch("/api/contractor-payment/save-decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          entityType: "quote",
          entityId: 0,
          entityName: "Manual Decision",
          invoiceAmount: parseFloat(invoiceAmount),
          squareMeters: parseFloat(squareMeters),
          ratePerSqm: parseFloat(ratePerSqm),
          contractorPercentage: parseFloat(contractorPercentage),
          chosenMethod,
        }),
      });

      if (!res.ok) throw new Error("Failed to save");
      await fetchSummary();
      setInvoiceAmount("");
      setSquareMeters("");
      setRatePerSqm("");
      setContractorPercentage("15");
      setDecision(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Contractor Payment Decision Model</h1>
        <p className="text-gray-600">
          Calculate optimal payment method: percentage-based vs. per square meter
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Total Decisions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summary?.totalDecisions || 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Total Savings</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">₪{(summary?.totalSavings || 0).toFixed(2)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Avg. Savings per Deal</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              ₪
              {summary && summary.totalDecisions > 0
                ? ((summary.totalSavings || 0) / summary.totalDecisions).toFixed(2)
                : "0.00"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Interactive Calculator</CardTitle>
          <CardDescription>Enter invoice details to get payment method recommendation</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Invoice Amount (with VAT)</label>
              <Input
                type="number"
                placeholder="₪0.00"
                value={invoiceAmount}
                onChange={(e) => setInvoiceAmount(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Square Meters</label>
              <Input
                type="number"
                placeholder="0.00"
                value={squareMeters}
                onChange={(e) => setSquareMeters(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Rate per Sq. Meter (₪)</label>
              <Input
                type="number"
                placeholder="₪0.00"
                value={ratePerSqm}
                onChange={(e) => setRatePerSqm(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Contractor Percentage (%)</label>
              <Input
                type="number"
                placeholder="%"
                value={contractorPercentage}
                onChange={(e) => setContractorPercentage(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <Button onClick={calculateDecision} disabled={loading} className="w-full">
            Calculate Best Method
          </Button>

          {decision && (
            <div className="space-y-4 mt-4">
              <Alert className="border-blue-200 bg-blue-50">
                <CheckCircle className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800">
                  <div className="space-y-2">
                    <p className="font-semibold">
                      Recommended: {decision.recommendation === "percentage" ? "Percentage-based" : "Per Square Meter"}
                    </p>
                    <p className="text-sm">Savings: ₪{decision.savings.toFixed(2)}</p>
                  </div>
                </AlertDescription>
              </Alert>

              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Percentage Method</CardTitle>
                    <CardDescription>{contractorPercentage}% of amount</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">₪{decision.paymentByPercentage.toFixed(2)}</p>
                    {decision.recommendation === "percentage" && (
                      <p className="text-xs text-green-600 mt-2 font-semibold">✓ Recommended</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Square Meter Method</CardTitle>
                    <CardDescription>₪{ratePerSqm} per m²</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">₪{decision.paymentBySqm.toFixed(2)}</p>
                    {decision.recommendation === "sqm" && (
                      <p className="text-xs text-green-600 mt-2 font-semibold">✓ Recommended</p>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="flex gap-2">
                <Button
                  variant={decision.recommendation === "percentage" ? "default" : "outline"}
                  onClick={() => saveDecision("percentage")}
                  disabled={loading}
                  className="flex-1"
                >
                  Use Percentage Method
                </Button>
                <Button
                  variant={decision.recommendation === "sqm" ? "default" : "outline"}
                  onClick={() => saveDecision("sqm")}
                  disabled={loading}
                  className="flex-1"
                >
                  Use Sq. Meter Method
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
