import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AlertCircle, CheckCircle, Plus, Settings, Upload } from "lucide-react";

interface IntegrationConfig {
  accounting?: {
    active: number;
    status: string;
  };
  bank?: {
    active: number;
    status: string;
  };
  payments?: {
    active: number;
    status: string;
  };
}

export default function IsraeliIntegrations() {
  const [status, setStatus] = useState<IntegrationConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Accounting form
  const [accountingForm, setAccountingForm] = useState({
    providerName: "",
    apiKey: "",
    companyId: "",
    syncFrequency: "daily",
  });

  // Bank form
  const [bankForm, setBankForm] = useState({
    bankName: "",
    bankCode: "",
    accessKey: "",
    companyNumber: "",
    importFormat: "ofx",
  });

  // Payment gateway form
  const [paymentForm, setPaymentForm] = useState({
    providerName: "",
    apiKey: "",
    merchantId: "",
    supportedMethods: ["credit_card"],
  });

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/israeli-integrations/status", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch status");
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error fetching status");
    } finally {
      setLoading(false);
    }
  };

  const connectAccounting = async () => {
    if (!accountingForm.providerName || !accountingForm.apiKey) {
      setError("Provider name and API key are required");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/israeli-integrations/accounting/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(accountingForm),
      });

      if (!res.ok) throw new Error("Failed to connect accounting software");
      await fetchStatus();
      setAccountingForm({ providerName: "", apiKey: "", companyId: "", syncFrequency: "daily" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error connecting");
    } finally {
      setLoading(false);
    }
  };

  const connectBank = async () => {
    if (!bankForm.bankName || !bankForm.bankCode) {
      setError("Bank name and code are required");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/israeli-integrations/bank/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(bankForm),
      });

      if (!res.ok) throw new Error("Failed to connect bank");
      await fetchStatus();
      setBankForm({ bankName: "", bankCode: "", accessKey: "", companyNumber: "", importFormat: "ofx" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error connecting");
    } finally {
      setLoading(false);
    }
  };

  const connectPayment = async () => {
    if (!paymentForm.providerName || !paymentForm.apiKey) {
      setError("Provider name and API key are required");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/israeli-integrations/payment-gateway/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(paymentForm),
      });

      if (!res.ok) throw new Error("Failed to connect payment gateway");
      await fetchStatus();
      setPaymentForm({ providerName: "", apiKey: "", merchantId: "", supportedMethods: ["credit_card"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error connecting");
    } finally {
      setLoading(false);
    }
  };

  const StatusBadge = ({ active, status }: { active: number; status: string }) => {
    const isConfigured = status === "configured";
    return (
      <div className="flex items-center space-x-2">
        {isConfigured ? (
          <CheckCircle className="h-5 w-5 text-green-600" />
        ) : (
          <AlertCircle className="h-5 w-5 text-gray-400" />
        )}
        <span className={isConfigured ? "text-green-600 font-semibold" : "text-gray-600"}>
          {isConfigured ? `${active} Active` : "Not Configured"}
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Israeli Business Integrations</h1>
        <p className="text-gray-600">Connect accounting software, banks, and payment gateways</p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {status && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Accounting Software</CardTitle>
              <CardDescription>Hashavshevet, Rivhit, etc.</CardDescription>
            </CardHeader>
            <CardContent>
              <StatusBadge active={status.accounting?.active || 0} status={status.accounting?.status || "not_configured"} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Bank Integration</CardTitle>
              <CardDescription>OFX, CSV, MT940 support</CardDescription>
            </CardHeader>
            <CardContent>
              <StatusBadge active={status.bank?.active || 0} status={status.bank?.status || "not_configured"} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Payment Gateways</CardTitle>
              <CardDescription>Tranzila, CardCom, PayPal</CardDescription>
            </CardHeader>
            <CardContent>
              <StatusBadge active={status.payments?.active || 0} status={status.payments?.status || "not_configured"} />
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="accounting" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="accounting">Accounting</TabsTrigger>
          <TabsTrigger value="bank">Bank</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="tax">Tax Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="accounting" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Accounting Software Connection</CardTitle>
              <CardDescription>Connect to Israeli accounting software for journal entry sync</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Software Provider</label>
                  <select
                    className="w-full border rounded px-3 py-2 mt-1"
                    value={accountingForm.providerName}
                    onChange={(e) => setAccountingForm({ ...accountingForm, providerName: e.target.value })}
                  >
                    <option value="">Select provider</option>
                    <option value="Hashavshevet">Hashavshevet</option>
                    <option value="Rivhit">Rivhit</option>
                    <option value="Heshbonit Mas">Heshbonit Mas</option>
                    <option value="Cheshbon">Cheshbon</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">API Key</label>
                  <Input
                    type="password"
                    placeholder="API key"
                    value={accountingForm.apiKey}
                    onChange={(e) => setAccountingForm({ ...accountingForm, apiKey: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Company ID</label>
                  <Input
                    placeholder="Company ID"
                    value={accountingForm.companyId}
                    onChange={(e) => setAccountingForm({ ...accountingForm, companyId: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Sync Frequency</label>
                  <select
                    className="w-full border rounded px-3 py-2 mt-1"
                    value={accountingForm.syncFrequency}
                    onChange={(e) => setAccountingForm({ ...accountingForm, syncFrequency: e.target.value })}
                  >
                    <option value="hourly">Hourly</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </div>
              </div>
              <Button onClick={connectAccounting} disabled={loading}>
                <Plus className="mr-2 h-4 w-4" />
                Connect Accounting Software
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bank" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Bank Integration</CardTitle>
              <CardDescription>Import transactions from Israeli banks</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Bank Name</label>
                  <select
                    className="w-full border rounded px-3 py-2 mt-1"
                    value={bankForm.bankName}
                    onChange={(e) => setBankForm({ ...bankForm, bankName: e.target.value })}
                  >
                    <option value="">Select bank</option>
                    <option value="Bank Hapoalim">Bank Hapoalim</option>
                    <option value="Bank Leumi">Bank Leumi</option>
                    <option value="Discount Bank">Discount Bank</option>
                    <option value="MIZRAHI">MIZRAHI Bank</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Bank Code</label>
                  <Input
                    placeholder="Bank code"
                    value={bankForm.bankCode}
                    onChange={(e) => setBankForm({ ...bankForm, bankCode: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Access Key</label>
                  <Input
                    type="password"
                    placeholder="Access key"
                    value={bankForm.accessKey}
                    onChange={(e) => setBankForm({ ...bankForm, accessKey: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Import Format</label>
                  <select
                    className="w-full border rounded px-3 py-2 mt-1"
                    value={bankForm.importFormat}
                    onChange={(e) => setBankForm({ ...bankForm, importFormat: e.target.value })}
                  >
                    <option value="ofx">OFX</option>
                    <option value="csv">CSV</option>
                    <option value="mt940">MT940</option>
                  </select>
                </div>
              </div>
              <Button onClick={connectBank} disabled={loading}>
                <Plus className="mr-2 h-4 w-4" />
                Connect Bank
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Payment Gateway Integration</CardTitle>
              <CardDescription>Connect credit card, direct debit, and online payment processors</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Gateway Provider</label>
                  <select
                    className="w-full border rounded px-3 py-2 mt-1"
                    value={paymentForm.providerName}
                    onChange={(e) => setPaymentForm({ ...paymentForm, providerName: e.target.value })}
                  >
                    <option value="">Select provider</option>
                    <option value="Tranzila">Tranzila</option>
                    <option value="CardCom">CardCom</option>
                    <option value="PayPal">PayPal</option>
                    <option value="Bit">Bit</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">API Key</label>
                  <Input
                    type="password"
                    placeholder="API key"
                    value={paymentForm.apiKey}
                    onChange={(e) => setPaymentForm({ ...paymentForm, apiKey: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Merchant ID</label>
                  <Input
                    placeholder="Merchant ID"
                    value={paymentForm.merchantId}
                    onChange={(e) => setPaymentForm({ ...paymentForm, merchantId: e.target.value })}
                    className="mt-1"
                  />
                </div>
              </div>
              <Button onClick={connectPayment} disabled={loading}>
                <Plus className="mr-2 h-4 w-4" />
                Connect Payment Gateway
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tax" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Tax Reporting</CardTitle>
              <CardDescription>Generate and submit tax reports to Israeli Tax Authority</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600 mb-4">
                Automatically generate VAT reports, withholding tax reports, and income tax reports for submission to the Israeli Tax Authority.
              </p>
              <div className="space-y-2">
                <Button variant="outline" className="w-full justify-start">
                  <Upload className="mr-2 h-4 w-4" />
                  Generate VAT Report
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <Upload className="mr-2 h-4 w-4" />
                  Generate Withholding Tax Report
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <Upload className="mr-2 h-4 w-4" />
                  Generate Income Tax Report
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
