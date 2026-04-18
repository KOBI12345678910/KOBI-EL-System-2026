import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Button, Input, Label, Card, Modal } from '@/components/ui-components';
import { authFetch } from '@/lib/utils';
import {
  Building2, Landmark, CreditCard, FileText, Plus, Trash2, Save,
  TestTube, Loader2, CheckCircle2, XCircle, RefreshCw, Download,
  ArrowRight, Settings2, Wifi, WifiOff, AlertCircle, TrendingUp,
  FileUp, BarChart3, Receipt, DollarSign, Banknote, Calculator,
  ArrowUpDown, BadgeCheck, Clock, ChevronDown, ChevronUp, Eye,
} from 'lucide-react';

const API = '/api';

interface AccountingConnector {
  id: number;
  provider: string;
  display_name: string;
  api_url: string | null;
  company_id: string | null;
  username: string | null;
  sync_invoices: boolean;
  sync_journal_entries: boolean;
  sync_customers: boolean;
  sync_suppliers: boolean;
  sync_tax_data: boolean;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_message: string | null;
  is_active: boolean;
  created_at: string;
}

interface BankConnection {
  id: number;
  bank_code: string;
  bank_name: string;
  branch_number: string | null;
  account_number: string | null;
  import_format: string;
  auto_reconcile: boolean;
  reconcile_tolerance_agorot: number;
  masav_sender_id: string | null;
  masav_sender_name: string | null;
  masav_institution_code: string | null;
  last_import_at: string | null;
  last_import_count: number;
  is_active: boolean;
}

interface PaymentGateway {
  id: number;
  provider: string;
  display_name: string;
  terminal_number: string | null;
  merchant_id: string | null;
  supports_charge: boolean;
  supports_refund: boolean;
  supports_tokenize: boolean;
  supports_recurring: boolean;
  currency: string;
  is_test_mode: boolean;
  webhook_url: string | null;
  last_transaction_at: string | null;
  is_active: boolean;
}

interface TaxReport {
  id: number;
  report_type: string;
  report_period: string;
  tax_year: number;
  tax_month: number;
  total_sales_agorot: number;
  total_purchases_agorot: number;
  vat_on_sales_agorot: number;
  vat_on_purchases_agorot: number;
  vat_payable_agorot: number;
  withholding_tax_agorot: number;
  status: string;
  submitted_at: string | null;
  confirmation_number: string | null;
  created_at: string;
}

interface DashboardData {
  accountingConnectors: number;
  bankConnections: number;
  paymentGateways: number;
  recentTransactions: number;
  unreconciledTransactions: number;
  pendingTaxReports: number;
  draftMasavFiles: number;
}

interface SyncHistoryRecord {
  id: number;
  source: string;
  direction: string;
  status: string;
  records_processed: number;
  records_failed: number;
  error_message: string | null;
  created_at: string;
}

type TabId = 'dashboard' | 'accounting' | 'banks' | 'payments' | 'tax' | 'history';

const PROVIDERS: Record<string, { label: string; icon: string; color: string }> = {
  hashavshevet: { label: 'חשבשבת', icon: '📊', color: 'text-blue-400' },
  rivhit: { label: 'רווחית', icon: '📈', color: 'text-green-400' },
  'heshbonit-mas': { label: 'חשבונית מס', icon: '🧾', color: 'text-orange-400' },
  cheshbon: { label: 'חשבון', icon: '📒', color: 'text-purple-400' },
};

const BANKS: Record<string, string> = {
  '12': 'בנק הפועלים',
  '11': 'בנק דיסקונט',
  '10': 'בנק לאומי',
  '20': 'בנק מזרחי טפחות',
  '31': 'בנק הבינלאומי',
  '14': 'בנק אוצר החייל',
  '13': 'בנק איגוד',
  '17': 'בנק מרכנתיל',
  '46': 'בנק מסד',
  '54': 'בנק ירושלים',
};

const PAYMENT_PROVIDERS: Record<string, { label: string; color: string }> = {
  tranzila: { label: 'Tranzila (טרנזילה)', color: 'text-blue-400' },
  cardcom: { label: 'CardCom (קארדקום)', color: 'text-green-400' },
  paypal: { label: 'PayPal (פייפאל)', color: 'text-yellow-400' },
};

const TAX_REPORT_TYPES: Record<string, string> = {
  vat: 'דוח מע"מ',
  vat_detailed: 'דוח מע"מ מפורט (PCN874)',
  withholding: 'דוח ניכוי מס במקור',
  withholding_856: 'דוח 856 ניכוי מס',
  annual_income: 'דוח שנתי - הכנסות',
};

function formatAgorot(agorot: number): string {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(agorot / 100);
}

export default function IsraeliIntegrationsPage() {
  const { token } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<'accounting' | 'bank' | 'gateway' | 'tax'>('accounting');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [testingId, setTestingId] = useState<number | null>(null);
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  const headers = { Authorization: `Bearer ${token}` };
  const jsonHeaders = { ...headers, 'Content-Type': 'application/json' };

  const { data: dashboard } = useQuery<DashboardData>({
    queryKey: ['israeli-biz-dashboard'],
    queryFn: async () => {
      const r = await authFetch(`${API}/israeli-biz/dashboard`, { headers });
      return r.ok ? r.json() : { accountingConnectors: 0, bankConnections: 0, paymentGateways: 0, recentTransactions: 0, unreconciledTransactions: 0, pendingTaxReports: 0, draftMasavFiles: 0 };
    },
    enabled: !!token,
  });

  const { data: connectors = [] } = useQuery<AccountingConnector[]>({
    queryKey: ['israeli-biz-accounting'],
    queryFn: async () => { const r = await authFetch(`${API}/israeli-biz/accounting/connectors`, { headers }); return r.ok ? r.json() : []; },
    enabled: !!token && (activeTab === 'dashboard' || activeTab === 'accounting'),
  });

  const { data: bankConns = [] } = useQuery<BankConnection[]>({
    queryKey: ['israeli-biz-banks'],
    queryFn: async () => { const r = await authFetch(`${API}/israeli-biz/bank/connections`, { headers }); return r.ok ? r.json() : []; },
    enabled: !!token && (activeTab === 'dashboard' || activeTab === 'banks'),
  });

  const { data: gateways = [] } = useQuery<PaymentGateway[]>({
    queryKey: ['israeli-biz-gateways'],
    queryFn: async () => { const r = await authFetch(`${API}/israeli-biz/payment/gateways`, { headers }); return r.ok ? r.json() : []; },
    enabled: !!token && (activeTab === 'dashboard' || activeTab === 'payments'),
  });

  const { data: taxReports = [] } = useQuery<TaxReport[]>({
    queryKey: ['israeli-biz-tax'],
    queryFn: async () => { const r = await authFetch(`${API}/israeli-biz/tax/reports`, { headers }); return r.ok ? r.json() : []; },
    enabled: !!token && (activeTab === 'dashboard' || activeTab === 'tax'),
  });

  const { data: syncHistory } = useQuery<{ data: SyncHistoryRecord[]; total: number }>({
    queryKey: ['israeli-biz-sync-history'],
    queryFn: async () => { const r = await authFetch(`${API}/israeli-biz/sync-history?limit=50`, { headers }); return r.ok ? r.json() : { data: [], total: 0 }; },
    enabled: !!token && (activeTab === 'history' || activeTab === 'dashboard'),
  });

  const saveMutation = useMutation({
    mutationFn: async (params: { url: string; method: string; body: Record<string, unknown> }) => {
      const r = await authFetch(`${API}${params.url}`, { method: params.method, headers: jsonHeaders, body: JSON.stringify(params.body) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'שגיאה'); }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['israeli-biz-accounting'] });
      qc.invalidateQueries({ queryKey: ['israeli-biz-banks'] });
      qc.invalidateQueries({ queryKey: ['israeli-biz-gateways'] });
      qc.invalidateQueries({ queryKey: ['israeli-biz-tax'] });
      qc.invalidateQueries({ queryKey: ['israeli-biz-dashboard'] });
      toast({ title: 'נשמר', description: 'הנתונים נשמרו בהצלחה' });
      closeModal();
    },
    onError: (e: Error) => { toast({ title: 'שגיאה', description: e.message, variant: 'destructive' }); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (url: string) => {
      const r = await authFetch(`${API}${url}`, { method: 'DELETE', headers });
      if (!r.ok) throw new Error('שגיאה');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['israeli-biz-accounting'] });
      qc.invalidateQueries({ queryKey: ['israeli-biz-banks'] });
      qc.invalidateQueries({ queryKey: ['israeli-biz-gateways'] });
      qc.invalidateQueries({ queryKey: ['israeli-biz-dashboard'] });
      toast({ title: 'נמחק', description: 'הרשומה הוסרה' });
    },
    onError: () => { toast({ title: 'שגיאה', description: 'לא ניתן למחוק', variant: 'destructive' }); },
  });

  const closeModal = () => { setShowModal(false); setEditingId(null); setFormData({}); };

  const openCreate = (type: typeof modalType) => {
    setModalType(type);
    setEditingId(null);
    setFormData({});
    setShowModal(true);
  };

  const openEdit = (type: typeof modalType, id: number, data: Record<string, unknown>) => {
    setModalType(type);
    setEditingId(id);
    setFormData(data);
    setShowModal(true);
  };

  const handleSave = () => {
    if (modalType === 'accounting') {
      const url = editingId ? `/israeli-biz/accounting/connectors/${editingId}` : '/israeli-biz/accounting/connectors';
      saveMutation.mutate({ url, method: editingId ? 'PUT' : 'POST', body: formData });
    } else if (modalType === 'bank') {
      const url = editingId ? `/israeli-biz/bank/connections/${editingId}` : '/israeli-biz/bank/connections';
      saveMutation.mutate({ url, method: editingId ? 'PUT' : 'POST', body: formData });
    } else if (modalType === 'gateway') {
      const url = editingId ? `/israeli-biz/payment/gateways/${editingId}` : '/israeli-biz/payment/gateways';
      saveMutation.mutate({ url, method: editingId ? 'PUT' : 'POST', body: formData });
    } else if (modalType === 'tax') {
      saveMutation.mutate({ url: '/israeli-biz/tax/reports/generate', method: 'POST', body: formData });
    }
  };

  const testConnector = async (id: number) => {
    setTestingId(id);
    try {
      const r = await authFetch(`${API}/israeli-biz/accounting/connectors/${id}/test`, { method: 'POST', headers: jsonHeaders });
      const result = await r.json();
      qc.invalidateQueries({ queryKey: ['israeli-biz-accounting'] });
      toast({ title: result.success ? 'חיבור תקין' : 'חיבור נכשל', description: result.message, variant: result.success ? 'default' : 'destructive' });
    } catch { toast({ title: 'שגיאה', description: 'שגיאת תקשורת', variant: 'destructive' }); }
    setTestingId(null);
  };

  const testGateway = async (id: number) => {
    setTestingId(id);
    try {
      const r = await authFetch(`${API}/israeli-biz/payment/gateways/${id}/test`, { method: 'POST', headers: jsonHeaders });
      const result = await r.json();
      qc.invalidateQueries({ queryKey: ['israeli-biz-gateways'] });
      toast({ title: result.success ? 'חיבור תקין' : 'חיבור נכשל', description: result.message, variant: result.success ? 'default' : 'destructive' });
    } catch { toast({ title: 'שגיאה', description: 'שגיאת תקשורת', variant: 'destructive' }); }
    setTestingId(null);
  };

  const syncConnector = async (id: number) => {
    setSyncingId(id);
    try {
      const r = await authFetch(`${API}/israeli-biz/accounting/connectors/${id}/sync`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ direction: 'import', entities: ['invoices', 'journal_entries', 'customers', 'suppliers'] }) });
      const result = await r.json();
      qc.invalidateQueries({ queryKey: ['israeli-biz-accounting'] });
      toast({ title: result.success ? 'סנכרון הושלם' : 'סנכרון נכשל', description: `${result.recordsProcessed} רשומות סונכרנו`, variant: result.success ? 'default' : 'destructive' });
    } catch { toast({ title: 'שגיאה', description: 'שגיאת תקשורת', variant: 'destructive' }); }
    setSyncingId(null);
  };

  const reconcileBank = async (id: number) => {
    setSyncingId(id);
    try {
      const r = await authFetch(`${API}/israeli-biz/bank/reconcile`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ connectionId: id }) });
      const result = await r.json();
      qc.invalidateQueries({ queryKey: ['israeli-biz-banks'] });
      qc.invalidateQueries({ queryKey: ['israeli-biz-dashboard'] });
      toast({ title: 'התאמה הושלמה', description: `${result.matched} התאמות, ${result.suggested} הצעות מתוך ${result.total}` });
    } catch { toast({ title: 'שגיאה', description: 'שגיאת תקשורת', variant: 'destructive' }); }
    setSyncingId(null);
  };

  const set = (key: string, val: unknown) => setFormData(prev => ({ ...prev, [key]: val }));

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'סקירה', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'accounting', label: 'הנה"ח', icon: <Building2 className="w-4 h-4" /> },
    { id: 'banks', label: 'בנקים', icon: <Landmark className="w-4 h-4" /> },
    { id: 'payments', label: 'סליקה', icon: <CreditCard className="w-4 h-4" /> },
    { id: 'tax', label: 'מס', icon: <FileText className="w-4 h-4" /> },
    { id: 'history', label: 'יומן סנכרון', icon: <Clock className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="p-6 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl sm:text-3xl font-bold flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
              <Building2 className="w-6 h-6 text-primary" />
            </div>
            אינטגרציות עסקיות ישראליות
          </h1>
          <p className="text-muted-foreground mt-1">חיבור לתוכנות הנה"ח, בנקים, סליקת אשראי ודיווחי מס</p>
        </div>

        <div className="flex gap-2 flex-wrap mb-6">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/30'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              {[
                { label: 'חיבורי הנה"ח', value: dashboard?.accountingConnectors ?? 0, icon: <Building2 className="w-5 h-5" />, color: 'text-blue-400', bg: 'bg-blue-500/10' },
                { label: 'חשבונות בנק', value: dashboard?.bankConnections ?? 0, icon: <Landmark className="w-5 h-5" />, color: 'text-green-400', bg: 'bg-green-500/10' },
                { label: 'שערי סליקה', value: dashboard?.paymentGateways ?? 0, icon: <CreditCard className="w-5 h-5" />, color: 'text-purple-400', bg: 'bg-purple-500/10' },
                { label: 'עסקאות 30 יום', value: dashboard?.recentTransactions ?? 0, icon: <TrendingUp className="w-5 h-5" />, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
                { label: 'ללא התאמה', value: dashboard?.unreconciledTransactions ?? 0, icon: <AlertCircle className="w-5 h-5" />, color: 'text-red-400', bg: 'bg-red-500/10' },
                { label: 'דוחות מס טיוטה', value: dashboard?.pendingTaxReports ?? 0, icon: <FileText className="w-5 h-5" />, color: 'text-orange-400', bg: 'bg-orange-500/10' },
                { label: 'קבצי מס"ב טיוטה', value: dashboard?.draftMasavFiles ?? 0, icon: <Banknote className="w-5 h-5" />, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
              ].map((stat, i) => (
                <Card key={i} className="p-4 text-center">
                  <div className={`w-10 h-10 ${stat.bg} rounded-xl flex items-center justify-center mx-auto mb-2`}>
                    <span className={stat.color}>{stat.icon}</span>
                  </div>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <div className="text-xs text-muted-foreground">{stat.label}</div>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="p-5">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-blue-400" />
                  חיבורי הנהלת חשבונות
                </h3>
                {connectors.length === 0 ? (
                  <p className="text-sm text-muted-foreground">אין חיבורים - לחץ "הוסף" בלשונית הנה"ח</p>
                ) : (
                  <div className="space-y-2">
                    {connectors.map(c => (
                      <div key={c.id} className="flex items-center justify-between p-2 bg-muted/20 rounded-lg">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{PROVIDERS[c.provider]?.icon || '📄'}</span>
                          <div>
                            <span className="text-sm font-medium">{c.display_name}</span>
                            <span className={`text-xs mr-2 ${c.last_sync_status === 'success' ? 'text-green-400' : c.last_sync_status === 'failed' ? 'text-red-400' : 'text-muted-foreground'}`}>
                              {c.last_sync_status === 'success' ? '✓' : c.last_sync_status === 'failed' ? '✗' : '—'}
                            </span>
                          </div>
                        </div>
                        {c.is_active ? <Wifi className="w-3 h-3 text-green-400" /> : <WifiOff className="w-3 h-3 text-muted-foreground" />}
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card className="p-5">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-purple-400" />
                  שערי סליקה
                </h3>
                {gateways.length === 0 ? (
                  <p className="text-sm text-muted-foreground">אין שערי סליקה - לחץ "הוסף" בלשונית סליקה</p>
                ) : (
                  <div className="space-y-2">
                    {gateways.map(g => (
                      <div key={g.id} className="flex items-center justify-between p-2 bg-muted/20 rounded-lg">
                        <div className="flex items-center gap-2">
                          <CreditCard className={`w-4 h-4 ${PAYMENT_PROVIDERS[g.provider]?.color || 'text-muted-foreground'}`} />
                          <div>
                            <span className="text-sm font-medium">{g.display_name}</span>
                            {g.is_test_mode && <span className="text-[10px] bg-yellow-500/10 text-yellow-400 px-1.5 py-0.5 rounded mr-2">בדיקות</span>}
                          </div>
                        </div>
                        {g.is_active ? <Wifi className="w-3 h-3 text-green-400" /> : <WifiOff className="w-3 h-3 text-muted-foreground" />}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>
        )}

        {activeTab === 'accounting' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2"><Building2 className="w-5 h-5" /> תוכנות הנהלת חשבונות</h2>
              <Button size="sm" className="gap-1" onClick={() => openCreate('accounting')}><Plus className="w-4 h-4" /> הוסף חיבור</Button>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {Object.entries(PROVIDERS).map(([key, p]) => {
                const conn = connectors.find(c => c.provider === key);
                return (
                  <Card key={key} className={`p-4 cursor-pointer transition-all hover:border-primary/30 ${conn ? 'border-green-500/30' : ''}`}
                    onClick={() => conn ? openEdit('accounting', conn.id, {
                      provider: key, displayName: conn.display_name, apiUrl: conn.api_url, companyId: conn.company_id, username: conn.username,
                      syncInvoices: conn.sync_invoices, syncJournalEntries: conn.sync_journal_entries, syncCustomers: conn.sync_customers,
                      syncSuppliers: conn.sync_suppliers, syncTaxData: conn.sync_tax_data, isActive: conn.is_active,
                    }) : openEdit('accounting', 0, { provider: key, displayName: p.label })}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-2xl">{p.icon}</span>
                      {conn ? <Wifi className="w-4 h-4 text-green-400" /> : <WifiOff className="w-4 h-4 text-muted-foreground" />}
                    </div>
                    <h3 className={`font-semibold text-sm ${p.color}`}>{p.label}</h3>
                    {conn && (
                      <div className="mt-2 text-[10px] text-muted-foreground">
                        {conn.last_sync_at && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(conn.last_sync_at).toLocaleDateString('he-IL')}</span>}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>

            {connectors.length > 0 && (
              <div className="space-y-3">
                {connectors.map(c => {
                  const prov = PROVIDERS[c.provider] || { label: c.provider, icon: '📄', color: 'text-muted-foreground' };
                  const isExpanded = expandedCard === `acc-${c.id}`;
                  return (
                    <Card key={c.id} className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{prov.icon}</span>
                          <div>
                            <h4 className="font-medium text-sm">{c.display_name}</h4>
                            <p className="text-xs text-muted-foreground">{prov.label} • {c.company_id || 'ללא מזהה חברה'}</p>
                          </div>
                          {c.last_sync_status === 'success' && <CheckCircle2 className="w-4 h-4 text-green-400" />}
                          {c.last_sync_status === 'failed' && <XCircle className="w-4 h-4 text-red-400" />}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => testConnector(c.id)} disabled={testingId === c.id}>
                            {testingId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <TestTube className="w-3 h-3" />}
                            בדוק
                          </Button>
                          <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => syncConnector(c.id)} disabled={syncingId === c.id}>
                            {syncingId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                            סנכרן
                          </Button>
                          <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => openEdit('accounting', c.id, {
                            provider: c.provider, displayName: c.display_name, apiUrl: c.api_url, companyId: c.company_id, username: c.username,
                            syncInvoices: c.sync_invoices, syncJournalEntries: c.sync_journal_entries, syncCustomers: c.sync_customers,
                            syncSuppliers: c.sync_suppliers, syncTaxData: c.sync_tax_data, isActive: c.is_active,
                          })}>
                            <Settings2 className="w-3 h-3" />
                          </Button>
                          <button onClick={() => setExpandedCard(isExpanded ? null : `acc-${c.id}`)} className="p-1 hover:bg-muted/50 rounded">
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground space-y-1">
                          <div className="flex gap-4 flex-wrap">
                            <span>חשבוניות: {c.sync_invoices ? '✓' : '✗'}</span>
                            <span>פקודות יומן: {c.sync_journal_entries ? '✓' : '✗'}</span>
                            <span>לקוחות: {c.sync_customers ? '✓' : '✗'}</span>
                            <span>ספקים: {c.sync_suppliers ? '✓' : '✗'}</span>
                            <span>מס: {c.sync_tax_data ? '✓' : '✗'}</span>
                          </div>
                          {c.last_sync_message && <p className="text-xs mt-1">{c.last_sync_message}</p>}
                          <div className="flex gap-2 mt-2">
                            <button onClick={() => deleteMutation.mutate(`/israeli-biz/accounting/connectors/${c.id}`)}
                              className="text-red-400 hover:text-red-300 text-xs flex items-center gap-1">
                              <Trash2 className="w-3 h-3" /> מחק
                            </button>
                          </div>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'banks' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2"><Landmark className="w-5 h-5" /> חשבונות בנק ומס"ב</h2>
              <Button size="sm" className="gap-1" onClick={() => openCreate('bank')}><Plus className="w-4 h-4" /> הוסף חשבון</Button>
            </div>

            {bankConns.length === 0 ? (
              <Card className="p-8 text-center">
                <Landmark className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-30" />
                <p className="text-lg font-medium">אין חשבונות בנק</p>
                <p className="text-sm text-muted-foreground mt-1">הוסף חשבון בנק לייבוא תנועות והפקת קבצי מס"ב</p>
                <Button className="mt-4 gap-1" onClick={() => openCreate('bank')}><Plus className="w-4 h-4" /> הוסף חשבון</Button>
              </Card>
            ) : (
              <div className="space-y-3">
                {bankConns.map(bc => {
                  const isExpanded = expandedCard === `bank-${bc.id}`;
                  return (
                    <Card key={bc.id} className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Landmark className="w-5 h-5 text-green-400" />
                          <div>
                            <h4 className="font-medium text-sm">{bc.bank_name}</h4>
                            <p className="text-xs text-muted-foreground">
                              סניף {bc.branch_number || '—'} • חשבון {bc.account_number || '—'} • {bc.import_format.toUpperCase()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => reconcileBank(bc.id)} disabled={syncingId === bc.id}>
                            {syncingId === bc.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowUpDown className="w-3 h-3" />}
                            התאם
                          </Button>
                          <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => openEdit('bank', bc.id, {
                            bankCode: bc.bank_code, bankName: bc.bank_name, branchNumber: bc.branch_number, accountNumber: bc.account_number,
                            importFormat: bc.import_format, autoReconcile: bc.auto_reconcile, reconcileToleranceAgorot: bc.reconcile_tolerance_agorot,
                            masavSenderId: bc.masav_sender_id, masavSenderName: bc.masav_sender_name, masavInstitutionCode: bc.masav_institution_code, isActive: bc.is_active,
                          })}>
                            <Settings2 className="w-3 h-3" />
                          </Button>
                          <button onClick={() => setExpandedCard(isExpanded ? null : `bank-${bc.id}`)} className="p-1 hover:bg-muted/50 rounded">
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground space-y-2">
                          <div className="flex gap-4 flex-wrap">
                            <span>התאמה אוטו: {bc.auto_reconcile ? '✓' : '✗'}</span>
                            <span>סבילות: {formatAgorot(bc.reconcile_tolerance_agorot)}</span>
                            {bc.masav_sender_id && <span>מזהה מס"ב: {bc.masav_sender_id}</span>}
                          </div>
                          {bc.last_import_at && (
                            <p className="flex items-center gap-1"><Clock className="w-3 h-3" /> ייבוא אחרון: {new Date(bc.last_import_at).toLocaleDateString('he-IL')} ({bc.last_import_count} תנועות)</p>
                          )}
                          <div className="flex gap-2 mt-2">
                            <button onClick={() => deleteMutation.mutate(`/israeli-biz/bank/connections/${bc.id}`)}
                              className="text-red-400 hover:text-red-300 text-xs flex items-center gap-1">
                              <Trash2 className="w-3 h-3" /> מחק
                            </button>
                          </div>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'payments' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2"><CreditCard className="w-5 h-5" /> שערי סליקת אשראי</h2>
              <Button size="sm" className="gap-1" onClick={() => openCreate('gateway')}><Plus className="w-4 h-4" /> הוסף שער</Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              {Object.entries(PAYMENT_PROVIDERS).map(([key, p]) => {
                const gw = gateways.find(g => g.provider === key);
                return (
                  <Card key={key} className={`p-4 cursor-pointer transition-all hover:border-primary/30 ${gw ? 'border-green-500/30' : ''}`}
                    onClick={() => gw ? openEdit('gateway', gw.id, {
                      provider: key, displayName: gw.display_name, terminalNumber: gw.terminal_number, merchantId: gw.merchant_id,
                      supportsCharge: gw.supports_charge, supportsRefund: gw.supports_refund, supportsTokenize: gw.supports_tokenize,
                      supportsRecurring: gw.supports_recurring, currency: gw.currency, isTestMode: gw.is_test_mode, webhookUrl: gw.webhook_url, isActive: gw.is_active,
                    }) : openEdit('gateway', 0, { provider: key, displayName: p.label })}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <CreditCard className={`w-6 h-6 ${p.color}`} />
                      {gw ? <Wifi className="w-4 h-4 text-green-400" /> : <WifiOff className="w-4 h-4 text-muted-foreground" />}
                    </div>
                    <h3 className="font-semibold text-sm">{p.label}</h3>
                    {gw && (
                      <div className="mt-2 space-y-1 text-[10px] text-muted-foreground">
                        {gw.terminal_number && <span>טרמינל: {gw.terminal_number}</span>}
                        {gw.is_test_mode && <span className="block text-yellow-400">מצב בדיקות</span>}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>

            {gateways.length > 0 && (
              <div className="space-y-3">
                {gateways.map(g => (
                  <Card key={g.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <CreditCard className={`w-5 h-5 ${PAYMENT_PROVIDERS[g.provider]?.color || 'text-muted-foreground'}`} />
                        <div>
                          <h4 className="font-medium text-sm">{g.display_name}</h4>
                          <p className="text-xs text-muted-foreground">
                            {PAYMENT_PROVIDERS[g.provider]?.label || g.provider}
                            {g.terminal_number && ` • טרמינל: ${g.terminal_number}`}
                            {g.is_test_mode && ' • בדיקות'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => testGateway(g.id)} disabled={testingId === g.id}>
                          {testingId === g.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <TestTube className="w-3 h-3" />}
                          בדוק
                        </Button>
                        <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => openEdit('gateway', g.id, {
                          provider: g.provider, displayName: g.display_name, terminalNumber: g.terminal_number, merchantId: g.merchant_id,
                          supportsCharge: g.supports_charge, supportsRefund: g.supports_refund, supportsTokenize: g.supports_tokenize,
                          supportsRecurring: g.supports_recurring, currency: g.currency, isTestMode: g.is_test_mode, webhookUrl: g.webhook_url, isActive: g.is_active,
                        })}>
                          <Settings2 className="w-3 h-3" />
                        </Button>
                        <button onClick={() => deleteMutation.mutate(`/israeli-biz/payment/gateways/${g.id}`)}
                          className="p-1 hover:bg-red-500/10 rounded text-muted-foreground hover:text-red-400">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'tax' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2"><Calculator className="w-5 h-5" /> דוחות מס</h2>
              <Button size="sm" className="gap-1" onClick={() => openCreate('tax')}><Plus className="w-4 h-4" /> הפק דוח</Button>
            </div>

            {taxReports.length === 0 ? (
              <Card className="p-8 text-center">
                <FileText className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-30" />
                <p className="text-lg font-medium">אין דוחות מס</p>
                <p className="text-sm text-muted-foreground mt-1">הפק דוח מע"מ, ניכוי מס במקור או דוח שנתי</p>
                <Button className="mt-4 gap-1" onClick={() => openCreate('tax')}><Plus className="w-4 h-4" /> הפק דוח</Button>
              </Card>
            ) : (
              <div className="space-y-3">
                {taxReports.map(tr => (
                  <Card key={tr.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-orange-400" />
                        <div>
                          <h4 className="font-medium text-sm">{TAX_REPORT_TYPES[tr.report_type] || tr.report_type}</h4>
                          <p className="text-xs text-muted-foreground">
                            תקופה: {tr.report_period} • מע"מ לתשלום: {formatAgorot(tr.vat_payable_agorot)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-lg border ${
                          tr.status === 'submitted' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                          tr.status === 'draft' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                          'bg-muted/30 text-muted-foreground border-border'
                        }`}>
                          {tr.status === 'submitted' ? 'הוגש' : tr.status === 'draft' ? 'טיוטה' : tr.status}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                      <span>מכירות: {formatAgorot(tr.total_sales_agorot)}</span>
                      <span>רכישות: {formatAgorot(tr.total_purchases_agorot)}</span>
                      <span>מע"מ עסקאות: {formatAgorot(tr.vat_on_sales_agorot)}</span>
                      <span>מע"מ תשומות: {formatAgorot(tr.vat_on_purchases_agorot)}</span>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2"><Clock className="w-5 h-5" /> יומן סנכרונים ופעולות</h2>
            {(!syncHistory || syncHistory.data.length === 0) ? (
              <Card className="p-8 text-center">
                <Clock className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-30" />
                <p className="text-lg font-medium">אין היסטוריית סנכרון</p>
                <p className="text-sm text-muted-foreground mt-1">פעולות סנכרון, בדיקות חיבור ועסקאות יירשמו כאן</p>
              </Card>
            ) : (
              <div className="space-y-2">
                {(syncHistory?.data || []).map(h => (
                  <Card key={h.id} className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {h.status === 'completed' ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                        <div>
                          <span className="text-sm font-medium">{h.source}</span>
                          <span className="text-xs text-muted-foreground mr-2">
                            {h.direction === 'import' ? '← ייבוא' : h.direction === 'export' ? '→ יצוא' : h.direction === 'test' ? '🔍 בדיקה' : h.direction}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {h.records_processed > 0 && <span className="text-green-400">{h.records_processed} הצליחו</span>}
                        {h.records_failed > 0 && <span className="text-red-400">{h.records_failed} נכשלו</span>}
                        <span>{new Date(h.created_at).toLocaleString('he-IL')}</span>
                      </div>
                    </div>
                    {h.error_message && <p className="text-xs text-red-400 mt-1 pr-7">{h.error_message}</p>}
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        <Modal open={showModal} onOpenChange={setShowModal} title={
          modalType === 'accounting' ? (editingId ? 'עריכת חיבור הנה"ח' : 'חיבור חדש להנה"ח') :
          modalType === 'bank' ? (editingId ? 'עריכת חשבון בנק' : 'חשבון בנק חדש') :
          modalType === 'gateway' ? (editingId ? 'עריכת שער סליקה' : 'שער סליקה חדש') :
          'הפקת דוח מס'
        }>
          <div className="space-y-4">
            {modalType === 'accounting' && (
              <>
                <div>
                  <Label>ספק תוכנה</Label>
                  <select className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm" value={String(formData.provider || '')} onChange={e => set('provider', e.target.value)}>
                    <option value="">בחר...</option>
                    {Object.entries(PROVIDERS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <Label>שם תצוגה</Label>
                  <Input className="mt-1" value={String(formData.displayName || '')} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('displayName', e.target.value)} placeholder="חשבשבת ראשי" />
                </div>
                <div>
                  <Label>כתובת API</Label>
                  <Input className="mt-1" dir="ltr" value={String(formData.apiUrl || '')} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('apiUrl', e.target.value)} placeholder="https://api.hashavshevet.com" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>API Key</Label>
                    <Input className="mt-1" dir="ltr" type="password" value={String(formData.apiKey || '')} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('apiKey', e.target.value)} />
                  </div>
                  <div>
                    <Label>API Secret</Label>
                    <Input className="mt-1" dir="ltr" type="password" value={String(formData.apiSecret || '')} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('apiSecret', e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>מזהה חברה</Label>
                    <Input className="mt-1" dir="ltr" value={String(formData.companyId || '')} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('companyId', e.target.value)} />
                  </div>
                  <div>
                    <Label>שם משתמש</Label>
                    <Input className="mt-1" dir="ltr" value={String(formData.username || '')} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('username', e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>סיסמה</Label>
                  <Input className="mt-1" dir="ltr" type="password" value={String(formData.password || '')} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('password', e.target.value)} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { key: 'syncInvoices', label: 'חשבוניות' },
                    { key: 'syncJournalEntries', label: 'פקודות יומן' },
                    { key: 'syncCustomers', label: 'לקוחות' },
                    { key: 'syncSuppliers', label: 'ספקים' },
                    { key: 'syncTaxData', label: 'נתוני מס' },
                  ].map(opt => (
                    <label key={opt.key} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={formData[opt.key] !== false} onChange={e => set(opt.key, e.target.checked)} className="rounded" />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </>
            )}

            {modalType === 'bank' && (
              <>
                <div>
                  <Label>בנק</Label>
                  <select className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm" value={String(formData.bankCode || '')} onChange={e => { set('bankCode', e.target.value); set('bankName', BANKS[e.target.value] || ''); }}>
                    <option value="">בחר בנק...</option>
                    {Object.entries(BANKS).map(([code, name]) => <option key={code} value={code}>{name} ({code})</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>מספר סניף</Label>
                    <Input className="mt-1" dir="ltr" value={String(formData.branchNumber || '')} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('branchNumber', e.target.value)} placeholder="001" />
                  </div>
                  <div>
                    <Label>מספר חשבון</Label>
                    <Input className="mt-1" dir="ltr" value={String(formData.accountNumber || '')} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('accountNumber', e.target.value)} placeholder="123456" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>פורמט ייבוא</Label>
                    <select className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm" value={String(formData.importFormat || 'csv')} onChange={e => set('importFormat', e.target.value)}>
                      <option value="csv">CSV</option>
                      <option value="ofx">OFX</option>
                    </select>
                  </div>
                  <div>
                    <Label>סבילות התאמה (אגורות)</Label>
                    <Input className="mt-1" dir="ltr" type="number" value={String(formData.reconcileToleranceAgorot || 100)} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('reconcileToleranceAgorot', Number(e.target.value))} />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={formData.autoReconcile !== false} onChange={e => set('autoReconcile', e.target.checked)} className="rounded" />
                  התאמה אוטומטית
                </label>
                <div className="border-t border-border pt-3">
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-1"><Banknote className="w-4 h-4" /> הגדרות מס"ב</h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>מזהה שולח</Label>
                      <Input className="mt-1" dir="ltr" value={String(formData.masavSenderId || '')} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('masavSenderId', e.target.value)} />
                    </div>
                    <div>
                      <Label>שם שולח</Label>
                      <Input className="mt-1" value={String(formData.masavSenderName || '')} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('masavSenderName', e.target.value)} />
                    </div>
                    <div>
                      <Label>קוד מוסד</Label>
                      <Input className="mt-1" dir="ltr" value={String(formData.masavInstitutionCode || '')} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('masavInstitutionCode', e.target.value)} />
                    </div>
                  </div>
                </div>
              </>
            )}

            {modalType === 'gateway' && (
              <>
                <div>
                  <Label>ספק סליקה</Label>
                  <select className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm" value={String(formData.provider || '')} onChange={e => set('provider', e.target.value)}>
                    <option value="">בחר...</option>
                    {Object.entries(PAYMENT_PROVIDERS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <Label>שם תצוגה</Label>
                  <Input className="mt-1" value={String(formData.displayName || '')} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('displayName', e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>מספר טרמינל</Label>
                    <Input className="mt-1" dir="ltr" value={String(formData.terminalNumber || '')} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('terminalNumber', e.target.value)} />
                  </div>
                  <div>
                    <Label>מזהה סוחר (Merchant ID)</Label>
                    <Input className="mt-1" dir="ltr" value={String(formData.merchantId || '')} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('merchantId', e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>API Key</Label>
                    <Input className="mt-1" dir="ltr" type="password" value={String(formData.apiKey || '')} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('apiKey', e.target.value)} />
                  </div>
                  <div>
                    <Label>API Secret</Label>
                    <Input className="mt-1" dir="ltr" type="password" value={String(formData.apiSecret || '')} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('apiSecret', e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>מטבע</Label>
                  <select className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm" value={String(formData.currency || 'ILS')} onChange={e => set('currency', e.target.value)}>
                    <option value="ILS">₪ שקל</option>
                    <option value="USD">$ דולר</option>
                    <option value="EUR">€ אירו</option>
                  </select>
                </div>
                <div>
                  <Label>Webhook URL</Label>
                  <Input className="mt-1" dir="ltr" value={String(formData.webhookUrl || '')} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('webhookUrl', e.target.value)} placeholder="https://..." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: 'supportsCharge', label: 'חיוב' },
                    { key: 'supportsRefund', label: 'זיכוי' },
                    { key: 'supportsTokenize', label: 'טוקניזציה' },
                    { key: 'supportsRecurring', label: 'חיוב חוזר' },
                  ].map(opt => (
                    <label key={opt.key} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={formData[opt.key] !== false} onChange={e => set(opt.key, e.target.checked)} className="rounded" />
                      {opt.label}
                    </label>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={formData.isTestMode !== false} onChange={e => set('isTestMode', e.target.checked)} className="rounded" />
                  מצב בדיקות (Sandbox)
                </label>
              </>
            )}

            {modalType === 'tax' && (
              <>
                <div>
                  <Label>סוג דוח</Label>
                  <select className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm" value={String(formData.reportType || '')} onChange={e => set('reportType', e.target.value)}>
                    <option value="">בחר סוג דוח...</option>
                    {Object.entries(TAX_REPORT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>שנת מס</Label>
                    <Input className="mt-1" type="number" value={String(formData.taxYear || new Date().getFullYear())} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('taxYear', Number(e.target.value))} />
                  </div>
                  <div>
                    <Label>חודש</Label>
                    <select className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm" value={String(formData.taxMonth || new Date().getMonth() + 1)} onChange={e => set('taxMonth', Number(e.target.value))}>
                      {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'][i]}</option>)}
                    </select>
                  </div>
                </div>
              </>
            )}

            <div className="flex items-center gap-2 pt-2 border-t border-border">
              <Button onClick={handleSave} disabled={saveMutation.isPending} className="flex-1 gap-2">
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {modalType === 'tax' ? 'הפק דוח' : (editingId ? 'עדכן' : 'שמור')}
              </Button>
              <Button variant="outline" onClick={closeModal}>ביטול</Button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
}
