import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useLocation } from 'wouter';
import {
  ArrowRight, ArrowLeftRight, Activity, Zap, Brain, 
  CheckCircle, AlertTriangle, Clock, Database, 
  UserPlus, Users, FileText, ShoppingCart, FolderKanban,
  Ruler, List, ShoppingBag, Package, Wrench, Truck,
  HardHat, Receipt, CreditCard, TrendingUp, RefreshCw,
  ChevronDown, ChevronUp, Eye, ExternalLink
} from 'lucide-react';

const API = '/api';

const nodeNavigationMap: Record<string, string> = {
  lead: '/crm/leads',
  customer: '/sales/customers',
  quotation: '/sales/quotations',
  sales_order: '/sales/orders',
  project: '/projects/dashboard',
  measurement: '/installation/measurements',
  bom: '/production/bom',
  purchase_order: '/purchase-orders',
  inventory: '/inventory/dashboard',
  work_order: '/production/work-orders',
  quality_control: '/production/qc-inspections',
  delivery: '/sales/delivery-notes',
  installation: '/production/installations',
  invoice: '/finance/invoices',
  payment: '/finance/payments',
  profitability: '/executive/profitability',
};

interface DataFlowNode {
  id: string;
  name: string;
  nameEn: string;
  module: string;
  category: string;
  icon: string;
  description: string;
  sourceInputs: string[];
  ownedData: string[];
  derivedData: string[];
  downstreamOutputs: string[];
  aiEnrichedFields: string[];
  upstreamModules: string[];
  downstreamModules: string[];
  syncRules: string[];
  validationRules: string[];
}

interface DataFlowEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  trigger: string;
  dataFields: string[];
  type: string;
}

interface Overview {
  lifecycle: string[];
  totalNodes: number;
  totalEdges: number;
  totalPipelines: number;
  syncHandlers: number;
  activeSyncHandlers: number;
  syncStatus: { totalSyncs: number; recentSyncs: number; successRate: number };
  enrichmentStatus: { total: number; last24h: number; successRate: number; totalFieldsEnriched: number };
  pipelineStatus: { total: number; last24h: number; successRate: number; totalRecords: number };
  categories: Record<string, number>;
}

const iconMap: Record<string, any> = {
  UserPlus, Users, FileText, ShoppingCart, FolderKanban,
  Ruler, List, ShoppingBag, Package, Wrench,
  CheckCircle, Truck, HardHat, Receipt, CreditCard, TrendingUp
};

const categoryColors: Record<string, string> = {
  crm: 'from-blue-600 to-blue-800',
  sales: 'from-emerald-600 to-emerald-800',
  engineering: 'from-purple-600 to-purple-800',
  procurement: 'from-orange-600 to-orange-800',
  inventory: 'from-yellow-600 to-yellow-800',
  production: 'from-red-600 to-red-800',
  logistics: 'from-cyan-600 to-cyan-800',
  installation: 'from-teal-600 to-teal-800',
  finance: 'from-indigo-600 to-indigo-800',
  executive: 'from-pink-600 to-pink-800',
};

const categoryLabels: Record<string, string> = {
  crm: 'CRM',
  sales: 'מכירות',
  engineering: 'הנדסה',
  procurement: 'רכש',
  inventory: 'מלאי',
  production: 'ייצור',
  logistics: 'לוגיסטיקה',
  installation: 'התקנות',
  finance: 'כספים',
  executive: 'ניהול',
};

export default function DataFlowDashboard() {
  const { data: dataflowdashboardData } = useQuery({
    queryKey: ["data-flow-dashboard"],
    queryFn: () => authFetch("/api/executive/data_flow_dashboard"),
    staleTime: 5 * 60 * 1000,
  });

  const [overview, setOverview] = useState<Overview | null>(null);
  const [nodes, setNodes] = useState<DataFlowNode[]>([]);
  const [edges, setEdges] = useState<DataFlowEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [expandedNode, setExpandedNode] = useState<string | null>(null);
  const [, navigate] = useLocation();

  const token = localStorage.getItem('erp_token');

  useEffect(() => {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    Promise.all([
      fetch(`${API}/data-flow/overview`, { headers }).then(r => r.json()),
      fetch(`${API}/data-flow/registry`, { headers }).then(r => r.json()),
    ])
      .then(([ov, reg]) => {
        setOverview(ov);
        setNodes(reg.nodes || []);
        setEdges(reg.edges || []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0e1a] to-[#1a1f35] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0e1a] to-[#1a1f35] flex items-center justify-center">
        <div className="text-red-400 text-center">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3" />
          <p>{error}</p>
        </div>
      </div>
    );
  }

  const lifecycleNodes = overview?.lifecycle.map(id => nodes.find(n => n.id === id)).filter(Boolean) as DataFlowNode[];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0e1a] to-[#1a1f35] p-6" dir="rtl">
      <div className="max-w-[1600px] mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <Activity className="w-8 h-8 text-blue-400" />
              זרימת נתונים - ארכיטקטורת המערכת
            </h1>
            <p className="text-muted-foreground mt-1">מערכת ERP כמערכת אחת מחוברת - זרימת נתונים מקצה לקצה</p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600/20 text-blue-400 rounded-lg hover:bg-blue-600/30 transition"
          >
            <RefreshCw className="w-4 h-4" />
            רענון
          </button>
        </div>

        {overview && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {[
              { label: 'מודולים', value: overview.totalNodes, icon: Database, color: 'blue' },
              { label: 'חיבורים', value: overview.totalEdges, icon: ArrowLeftRight, color: 'emerald' },
              { label: 'צינורות נתונים', value: overview.totalPipelines, icon: Zap, color: 'purple' },
              { label: 'סנכרונים פעילים', value: overview.activeSyncHandlers, icon: RefreshCw, color: 'orange' },
              { label: 'העשרת AI', value: overview.enrichmentStatus.last24h, icon: Brain, color: 'pink' },
              { label: 'הצלחה %', value: `${overview.syncStatus.successRate.toFixed(0)}%`, icon: CheckCircle, color: 'green' },
            ].map((stat, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-card/80 rounded-xl p-4 border border-border/50"
              >
                <div className="flex items-center gap-2 mb-2">
                  <stat.icon className={`w-5 h-5 text-${stat.color}-400`} />
                  <span className="text-muted-foreground text-sm">{stat.label}</span>
                </div>
                <div className="text-2xl font-bold text-foreground">{stat.value}</div>
              </motion.div>
            ))}
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-card/80 rounded-xl p-6 border border-border/50"
        >
          <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
            <ArrowRight className="w-5 h-5 text-blue-400" />
            מחזור חיי עסקי מלא
          </h2>
          <p className="text-muted-foreground text-sm mb-6">
            ליד → לקוח → הצעת מחיר → הזמנה → פרויקט → מדידה → הנדסה → BOM → רכש → מלאי → ייצור → בקרת איכות → אספקה → התקנה → חשבונית → תשלום → רווחיות
          </p>

          <div className="overflow-x-auto">
            <div className="flex items-center gap-2 min-w-max pb-4">
              {lifecycleNodes?.map((node, i) => {
                const Icon = iconMap[node.icon] || Database;
                const isSelected = selectedNode === node.id;
                const catColor = categoryColors[node.category] || 'from-gray-600 to-gray-800';

                return (
                  <div key={node.id} className="flex items-center gap-2">
                    <div className="flex flex-col items-center gap-1">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                          setSelectedNode(isSelected ? null : node.id);
                          setExpandedNode(isSelected ? null : node.id);
                        }}
                        className={`flex flex-col items-center p-3 rounded-xl border transition-all min-w-[90px] ${
                          isSelected
                            ? 'border-blue-400 bg-blue-600/20 shadow-lg shadow-blue-500/20'
                            : 'border-border/50 bg-muted/80 hover:border-border'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${catColor} flex items-center justify-center mb-2`}>
                          <Icon className="w-5 h-5 text-foreground" />
                        </div>
                        <span className="text-foreground text-xs font-medium text-center leading-tight">{node.name}</span>
                        <span className="text-muted-foreground text-[10px] mt-0.5">{categoryLabels[node.category]}</span>
                        {node.aiEnrichedFields.length > 0 && (
                          <div className="flex items-center gap-0.5 mt-1">
                            <Brain className="w-3 h-3 text-purple-400" />
                            <span className="text-purple-400 text-[10px]">{node.aiEnrichedFields.length}</span>
                          </div>
                        )}
                      </motion.button>
                      {nodeNavigationMap[node.id] && (
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(nodeNavigationMap[node.id]); }}
                          className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-blue-400 hover:text-blue-300 bg-blue-600/10 hover:bg-blue-600/20 rounded transition"
                        >
                          <ExternalLink className="w-2.5 h-2.5" />
                          פתח מודול
                        </button>
                      )}
                    </div>
                    {i < lifecycleNodes.length - 1 && (
                      <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0 rotate-180" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>

        {selectedNode && (() => {
          const node = nodes.find(n => n.id === selectedNode);
          if (!node) return null;
          const inEdges = edges.filter(e => e.to === selectedNode);
          const outEdges = edges.filter(e => e.from === selectedNode);

          return (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-card/80 rounded-xl p-6 border border-blue-500/30"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-bold text-foreground">{node.name} ({node.nameEn})</h3>
                  <p className="text-muted-foreground text-sm mt-1">{node.description}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs bg-gradient-to-r ${categoryColors[node.category]} text-foreground`}>
                      {node.module}
                    </span>
                    {nodeNavigationMap[node.id] && (
                      <button
                        onClick={() => navigate(nodeNavigationMap[node.id])}
                        className="flex items-center gap-1.5 px-3 py-1 text-xs text-blue-400 bg-blue-600/20 hover:bg-blue-600/30 rounded-lg border border-blue-500/30 transition"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        {'מעבר לדף ' + node.name}
                      </button>
                    )}
                  </div>
                </div>
                <button onClick={() => { setSelectedNode(null); setExpandedNode(null); }} className="text-muted-foreground hover:text-foreground">
                  <ChevronUp className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <div className="bg-muted rounded-lg p-3">
                  <h4 className="text-blue-400 text-sm font-medium mb-2 flex items-center gap-1">
                    <Database className="w-3.5 h-3.5" /> נתונים עצמיים
                  </h4>
                  <div className="space-y-1">
                    {node.ownedData.map((d, i) => <span key={i} className="block text-gray-300 text-xs">{d}</span>)}
                  </div>
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <h4 className="text-emerald-400 text-sm font-medium mb-2 flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5" /> נתונים נגזרים
                  </h4>
                  <div className="space-y-1">
                    {node.derivedData.map((d, i) => <span key={i} className="block text-gray-300 text-xs">{d}</span>)}
                  </div>
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <h4 className="text-purple-400 text-sm font-medium mb-2 flex items-center gap-1">
                    <Brain className="w-3.5 h-3.5" /> העשרת AI
                  </h4>
                  <div className="space-y-1">
                    {node.aiEnrichedFields.length > 0 
                      ? node.aiEnrichedFields.map((f, i) => <span key={i} className="block text-gray-300 text-xs font-mono">{f}</span>)
                      : <span className="text-muted-foreground text-xs">אין העשרה</span>
                    }
                  </div>
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <h4 className="text-orange-400 text-sm font-medium mb-2 flex items-center gap-1">
                    <RefreshCw className="w-3.5 h-3.5" /> כללי סנכרון
                  </h4>
                  <div className="space-y-1">
                    {node.syncRules.map((r, i) => <span key={i} className="block text-gray-300 text-xs">{r}</span>)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-muted rounded-lg p-3">
                  <h4 className="text-cyan-400 text-sm font-medium mb-2">← זרימה נכנסת ({inEdges.length})</h4>
                  {inEdges.length > 0 ? (
                    <div className="space-y-2">
                      {inEdges.map(e => {
                        const fromNode = nodes.find(n => n.id === e.from);
                        return (
                          <div key={e.id} className="flex items-center gap-2 text-xs">
                            <span className="text-foreground font-medium">{fromNode?.name || e.from}</span>
                            <ArrowRight className="w-3 h-3 text-muted-foreground rotate-180" />
                            <span className="text-cyan-300">{e.label}</span>
                            <span className="text-muted-foreground">({e.trigger})</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : <span className="text-muted-foreground text-xs">אין זרימה נכנסת (נקודת כניסה)</span>}
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <h4 className="text-amber-400 text-sm font-medium mb-2">→ זרימה יוצאת ({outEdges.length})</h4>
                  {outEdges.length > 0 ? (
                    <div className="space-y-2">
                      {outEdges.map(e => {
                        const toNode = nodes.find(n => n.id === e.to);
                        return (
                          <div key={e.id} className="flex items-center gap-2 text-xs">
                            <span className="text-amber-300">{e.label}</span>
                            <ArrowRight className="w-3 h-3 text-muted-foreground rotate-180" />
                            <span className="text-foreground font-medium">{toNode?.name || e.to}</span>
                            <span className="text-muted-foreground">({e.trigger})</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : <span className="text-muted-foreground text-xs">אין זרימה יוצאת (נקודת סיום)</span>}
                </div>
              </div>
            </motion.div>
          );
        })()}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-card/80 rounded-xl p-5 border border-border/50"
          >
            <h3 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-orange-400" />
              סנכרון בין-מודולי
            </h3>
            <div className="space-y-2">
              {overview?.syncStatus && (
                <div className="text-sm text-gray-300">
                  <span>{overview.syncStatus.recentSyncs} סנכרונים (24 שעות)</span>
                  <span className="mx-2">|</span>
                  <span className="text-green-400">{overview.syncStatus.successRate.toFixed(0)}% הצלחה</span>
                </div>
              )}
              <div className="mt-3 space-y-1.5">
                {[
                  'ליד → לקוח + AR',
                  'הצעת מחיר → הזמנת מכירה',
                  'הזמנה → פרויקט + חשבונית',
                  'רכש → מלאי',
                  'פקודת עבודה → תעודת משלוח',
                  'תעודת משלוח → התקנה',
                  'התקנה → חשבונית סופית',
                  'כשל QC → NCR',
                  'חשבונית ספק → AP',
                  'מלאי נמוך → התראה',
                  'שינוי עובד → הרשאות',
                ].map((rule, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <CheckCircle className="w-3 h-3 text-green-400 flex-shrink-0" />
                    <span className="text-gray-300">{rule}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-card/80 rounded-xl p-5 border border-border/50"
          >
            <h3 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
              <Brain className="w-5 h-5 text-purple-400" />
              שכבת העשרת AI
            </h3>
            <div className="space-y-2">
              {overview?.enrichmentStatus && (
                <div className="text-sm text-gray-300">
                  <span>{overview.enrichmentStatus.last24h} העשרות (24 שעות)</span>
                  <span className="mx-2">|</span>
                  <span className="text-purple-400">{overview.enrichmentStatus.totalFieldsEnriched} שדות הועשרו</span>
                </div>
              )}
              <div className="mt-3 space-y-1.5">
                {[
                  { module: 'CRM/לידים', fields: 'סוג פרויקט, דחיפות, חומר, תקציב' },
                  { module: 'הצעות מחיר', fields: 'דרגת מחיר, מע"מ, חומרים נדרשים' },
                  { module: 'הזמנות מכירה', fields: 'עדיפות ייצור, רווח גולמי, צרכי רכש' },
                  { module: 'פקודות עבודה', fields: 'שטח ייצור, אורך חיתוך, זמן' },
                  { module: 'רכש', fields: 'דרגת תקציב, אישור נדרש' },
                  { module: 'אספקה', fields: 'משקל, כמויות, יעד' },
                  { module: 'התקנה', fields: 'שעות צפויות, ימים להתקנה' },
                  { module: 'חשבוניות', fields: 'הכנסה נטו, רווח, מרווח %' },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <Zap className="w-3 h-3 text-purple-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="text-foreground font-medium">{item.module}: </span>
                      <span className="text-muted-foreground">{item.fields}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="bg-card/80 rounded-xl p-5 border border-border/50"
          >
            <h3 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
              <Zap className="w-5 h-5 text-emerald-400" />
              צינורות נתונים אוטומטיים
            </h3>
            <div className="space-y-2">
              {overview?.pipelineStatus && (
                <div className="text-sm text-gray-300">
                  <span>{overview.pipelineStatus.last24h} הרצות (24 שעות)</span>
                  <span className="mx-2">|</span>
                  <span className="text-emerald-400">{overview.pipelineStatus.totalRecords} רשומות עודכנו</span>
                </div>
              )}
              <div className="mt-3 space-y-1.5">
                {[
                  'הזמנת רכש → חשבונות זכאים',
                  'קבלת טובין → מלאי חומרי גלם',
                  'חשבוניות → ספר ראשי (GL)',
                  'בקשת רכש → הזמנת רכש',
                  'הזמנת מכירה → ייצור + חשבונית + AR',
                  'חשבונית ששולמה → תזרים מזומנים',
                  'נקודת הזמנה → בקשת רכש',
                  'קבלת רכש → מלאי + AP',
                  'עובד חדש → שכר + קליטה',
                  'אבן דרך → התקדמות פרויקט',
                ].map((pipe, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <ArrowLeftRight className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                    <span className="text-gray-300">{pipe}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="bg-card/80 rounded-xl p-6 border border-border/50"
        >
          <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
            <Eye className="w-5 h-5 text-cyan-400" />
            מפרט נתונים לפי מודול
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {nodes.map(node => {
              const Icon = iconMap[node.icon] || Database;
              const inCount = edges.filter(e => e.to === node.id).length;
              const outCount = edges.filter(e => e.from === node.id).length;
              const isExpanded = expandedNode === node.id;

              return (
                <div
                  key={node.id}
                  className={`text-right p-3 rounded-lg border transition-all ${
                    isExpanded ? 'border-blue-400 bg-blue-600/10' : 'border-border/50 bg-muted/60 hover:border-border'
                  }`}
                >
                  <button
                    onClick={() => {
                      setSelectedNode(isExpanded ? null : node.id);
                      setExpandedNode(isExpanded ? null : node.id);
                    }}
                    className="w-full text-right"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-7 h-7 rounded bg-gradient-to-br ${categoryColors[node.category]} flex items-center justify-center`}>
                        <Icon className="w-3.5 h-3.5 text-foreground" />
                      </div>
                      <span className="text-foreground text-sm font-medium">{node.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span>{'\u2190'} {inCount}</span>
                      <span>{'\u2192'} {outCount}</span>
                      <span>{node.ownedData.length} שדות</span>
                      {node.aiEnrichedFields.length > 0 && (
                        <span className="text-purple-400">AI: {node.aiEnrichedFields.length}</span>
                      )}
                    </div>
                  </button>
                  {nodeNavigationMap[node.id] && (
                    <button
                      onClick={() => navigate(nodeNavigationMap[node.id])}
                      className="flex items-center gap-1 mt-2 px-2 py-0.5 text-[10px] text-blue-400 hover:text-blue-300 bg-blue-600/10 hover:bg-blue-600/20 rounded transition w-full justify-center"
                    >
                      <ExternalLink className="w-2.5 h-2.5" />
                      {'מעבר ל' + node.name}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="bg-card/80 rounded-xl p-6 border border-border/50"
        >
          <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-amber-400" />
            כל חיבורי הנתונים ({edges.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b border-border/50">
                  <th className="text-right py-2 px-3">מקור</th>
                  <th className="text-right py-2 px-3">יעד</th>
                  <th className="text-right py-2 px-3">תיאור</th>
                  <th className="text-right py-2 px-3">טריגר</th>
                  <th className="text-right py-2 px-3">סוג</th>
                  <th className="text-right py-2 px-3">שדות</th>
                </tr>
              </thead>
              <tbody>
                {edges.map(edge => {
                  const fromNode = nodes.find(n => n.id === edge.from);
                  const toNode = nodes.find(n => n.id === edge.to);
                  const typeColors: Record<string, string> = {
                    event: 'text-blue-400 bg-blue-400/10',
                    pipeline: 'text-emerald-400 bg-emerald-400/10',
                    sync: 'text-orange-400 bg-orange-400/10',
                    derived: 'text-purple-400 bg-purple-400/10',
                  };
                  return (
                    <tr key={edge.id} className="border-b border-border/50 hover:bg-muted/50">
                      <td className="py-2 px-3 text-foreground">{fromNode?.name || edge.from}</td>
                      <td className="py-2 px-3 text-foreground">{toNode?.name || edge.to}</td>
                      <td className="py-2 px-3 text-gray-300">{edge.label}</td>
                      <td className="py-2 px-3 text-muted-foreground text-xs font-mono">{edge.trigger}</td>
                      <td className="py-2 px-3">
                        <span className={`px-1.5 py-0.5 rounded text-xs ${typeColors[edge.type] || 'text-muted-foreground'}`}>
                          {edge.type}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-muted-foreground text-xs">{edge.dataFields.join(', ')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
