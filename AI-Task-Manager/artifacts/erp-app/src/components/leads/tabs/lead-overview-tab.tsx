import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  User, Phone, Mail, MapPin, Building2, FileText, Hash, Clock, Calendar, Edit2, Save, X,
  DollarSign, Target, TrendingUp, Users, Flag, Zap, Package, AlertCircle, Info, BarChart3, ShoppingBag
} from 'lucide-react';
import TimelineFeed from '../TimelineFeed';
import AIInsightsPanel from '../AIInsightsPanel';
import AIAutomationEngine from '@/components/automation/AIAutomationEngine';
import PredictiveAnalytics from '@/components/automation/PredictiveAnalytics';
import { format } from 'date-fns';
import { entityUpdate } from '@/lib/entity-api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { LucideIcon } from 'lucide-react';

/* ─── Types ─── */

interface Lead {
  id: number | string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  address_city?: string;
  address_street?: string;
  address_number?: string;
  building_details?: string;
  building_floor?: string;
  source?: string;
  status?: string;
  stage?: string;
  grade?: string;
  owner_id?: string;
  deal_value?: number;
  win_probability?: number;
  expected_close_date?: string;
  campaign?: string;
  interested_product?: string;
  package_type?: string;
  main_need?: string;
  problem_to_solve?: string;
  estimated_budget?: number;
  urgency?: string;
  competitors_checked?: string;
  info_source?: string;
  pain_point?: string;
  expected_roi?: string;
  notes?: string;
  created_date?: string;
  updated_date?: string;
  created_by?: string;
}

interface EditData {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  address_city: string;
  address_street: string;
  address_number: string;
  building_details: string;
  building_floor: string;
  source: string;
  status: string;
  stage: string;
  grade: string;
  owner_id: string;
  deal_value: number | string;
  win_probability: number | string;
  expected_close_date: string;
  campaign: string;
  interested_product: string;
  package_type: string;
  main_need: string;
  problem_to_solve: string;
  estimated_budget: number | string;
  urgency: string;
  competitors_checked: string;
  info_source: string;
  pain_point: string;
  expected_roi: string;
}

interface LeadOverviewTabProps {
  lead: Lead;
}

interface SelectOption {
  value: string;
  label: string;
}

export default function LeadOverviewTab({ lead }: LeadOverviewTabProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<EditData>({} as EditData);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      console.log('Updating lead:', lead.id, 'with data:', data);
      const result = await entityUpdate("leads", lead.id, data);
      console.log('Update result:', result);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', lead.id] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setIsEditing(false);
      setEditData({} as EditData);
      setErrors({});
      toast.success('השינויים נשמרו בהצלחה');
    },
    onError: (error: Error) => {
      console.error('Update error:', error);
      toast.error('שגיאה בעדכון הפרטים: ' + error.message);
    }
  });

  const handleEdit = () => {
    setEditData({
      first_name: lead.first_name || '',
      last_name: lead.last_name || '',
      phone: lead.phone || '',
      email: lead.email || '',
      address_city: lead.address_city || '',
      address_street: lead.address_street || '',
      address_number: lead.address_number || '',
      building_details: lead.building_details || '',
      building_floor: lead.building_floor || '',
      source: lead.source || 'website',
      status: lead.status || 'new',
      stage: lead.stage || 'new',
      grade: lead.grade || '',
      owner_id: lead.owner_id || '',
      deal_value: lead.deal_value ? Number(lead.deal_value) : 0,
      win_probability: lead.win_probability ? Number(lead.win_probability) : 0,
      expected_close_date: lead.expected_close_date || '',
      campaign: lead.campaign || '',
      interested_product: lead.interested_product || '',
      package_type: lead.package_type || '',
      main_need: lead.main_need || '',
      problem_to_solve: lead.problem_to_solve || '',
      estimated_budget: lead.estimated_budget ? Number(lead.estimated_budget) : 0,
      urgency: lead.urgency || '',
      competitors_checked: lead.competitors_checked || '',
      info_source: lead.info_source || '',
      pain_point: lead.pain_point || '',
      expected_roi: lead.expected_roi || ''
    });
    setIsEditing(true);
  };

  const handleSave = () => {
    if (!editData.phone || editData.phone.trim() === '') {
      toast.error('שדה טלפון הוא חובה');
      setErrors({ phone: true });
      return;
    }

    console.log('Saving data:', editData);

    // Convert numeric fields and filter empty values
    const cleanData: Record<string, unknown> = {};
    (Object.keys(editData) as Array<keyof EditData>).forEach(key => {
      let value: unknown = editData[key];

      // Handle numeric fields
      if (['deal_value', 'win_probability', 'estimated_budget'].includes(key)) {
        value = value === '' || value === null ? undefined : Number(value);
      }

      // Only include non-empty values
      if (value !== '' && value !== undefined) {
        cleanData[key] = value;
      }
    });

    setErrors({});
    updateMutation.mutate(cleanData);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditData({} as EditData);
    setErrors({});
  };

  const sourceOptions: SelectOption[] = [
    { value: 'website', label: 'אתר' },
    { value: 'facebook', label: 'פייסבוק' },
    { value: 'instagram', label: 'אינסטגרם' },
    { value: 'google', label: 'גוגל' },
    { value: 'referral', label: 'המלצה' },
    { value: 'phone', label: 'טלפון' },
    { value: 'other', label: 'אחר' }
  ];

  const statusOptions: SelectOption[] = [
    { value: 'new', label: 'חדש' },
    { value: 'contacted', label: 'נוצר קשר' },
    { value: 'no_answer', label: 'לא עונה' },
    { value: 'interested', label: 'מעוניין' },
    { value: 'proposal', label: 'שליחת הצעה' },
    { value: 'negotiation', label: 'במשא ומתן' },
    { value: 'waiting_response', label: 'ממתין לתשובה' },
    { value: 'won', label: 'סגור זכייה' },
    { value: 'lost', label: 'סגור הפסד' },
    { value: 'not_relevant', label: 'לא רלוונטי' }
  ];

  const gradeOptions: SelectOption[] = [
    { value: 'hot', label: 'חם' },
    { value: 'warm', label: 'פושר' },
    { value: 'cold', label: 'קר' }
  ];

  const urgencyOptions: SelectOption[] = [
    { value: 'low', label: 'נמוכה' },
    { value: 'medium', label: 'בינונית' },
    { value: 'high', label: 'גבוהה' },
    { value: 'urgent', label: 'דחוף!' }
  ];

  return (
    <div className="grid grid-cols-12 gap-6">
      {/* Main Content - 8 columns */}
      <div className="col-span-8 space-y-6">
        {isEditing && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-blue-700">
              <Zap className="w-4 h-4" />
              <span className="text-sm font-medium">מצב עריכה - השינויים נשמרים אוטומטית</span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} className="bg-green-600 hover:bg-green-700">
                <Save className="w-4 h-4 ml-1" />
                שמור
              </Button>
              <Button size="sm" variant="outline" onClick={handleCancel}>
                <X className="w-4 h-4 ml-1" />
                ביטול
              </Button>
            </div>
          </div>
        )}

        {/* Lead Info - Modern & Colorful */}
        <Card className="shadow-xl border-0 overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-indigo-600 via-blue-600 to-purple-600 text-white py-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-bold flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <User className="w-5 h-5" />
                </div>
                מידע כללי
              </CardTitle>
              {!isEditing && (
                <Button size="sm" onClick={handleEdit} className="gap-2 bg-white/20 hover:bg-white/30 text-white border-white/30">
                  <Edit2 className="w-4 h-4" />
                  עריכה
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">
              {/* Row 1 */}
              <div className="grid grid-cols-3 gap-4">
                <div className="group">
                  <div className="text-xs font-medium text-indigo-600 mb-2 flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-lg bg-indigo-100 flex items-center justify-center">
                      <User className="w-3 h-3 text-indigo-600" />
                    </div>
                    שם פרטי
                  </div>
                  {isEditing ? (
                    <Input
                      value={editData.first_name}
                      onChange={(e) => setEditData({...editData, first_name: e.target.value})}
                      className={`h-10 ${errors.first_name ? 'border-red-500' : 'border-indigo-200'} focus:border-indigo-500`}
                      placeholder="חובה *"
                    />
                  ) : (
                    <div className="font-semibold text-slate-900 bg-white rounded-lg px-4 py-2.5 border border-slate-200 group-hover:border-indigo-300 group-hover:shadow-md transition-all">
                      {lead.first_name || '-'}
                    </div>
                  )}
                </div>

                <div className="group">
                  <div className="text-xs font-medium text-purple-600 mb-2 flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-lg bg-purple-100 flex items-center justify-center">
                      <User className="w-3 h-3 text-purple-600" />
                    </div>
                    שם משפחה
                  </div>
                  {isEditing ? (
                    <Input
                      value={editData.last_name}
                      onChange={(e) => setEditData({...editData, last_name: e.target.value})}
                      className={`h-10 ${errors.last_name ? 'border-red-500' : 'border-purple-200'} focus:border-purple-500`}
                      placeholder="חובה *"
                    />
                  ) : (
                    <div className="font-semibold text-slate-900 bg-white rounded-lg px-4 py-2.5 border border-slate-200 group-hover:border-purple-300 group-hover:shadow-md transition-all">
                      {lead.last_name || '-'}
                    </div>
                  )}
                </div>

                <div className="group">
                  <div className="text-xs font-medium text-green-600 mb-2 flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-lg bg-green-100 flex items-center justify-center">
                      <Phone className="w-3 h-3 text-green-600" />
                    </div>
                    טלפון
                  </div>
                  {isEditing ? (
                    <Input
                      value={editData.phone}
                      onChange={(e) => setEditData({...editData, phone: e.target.value})}
                      className={`h-10 ${errors.phone ? 'border-red-500' : 'border-green-200'} focus:border-green-500`}
                      dir="ltr"
                      placeholder="חובה *"
                    />
                  ) : (
                    <div className="font-semibold text-slate-900 bg-white rounded-lg px-4 py-2.5 border border-slate-200 group-hover:border-green-300 group-hover:shadow-md transition-all" dir="ltr">
                      {lead.phone || '-'}
                    </div>
                  )}
                </div>
              </div>

              {/* Row 2: Address */}
              <div className="grid grid-cols-3 gap-4">
                <div className="group">
                  <div className="text-xs font-medium text-cyan-600 mb-2 flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-lg bg-cyan-100 flex items-center justify-center">
                      <MapPin className="w-3 h-3 text-cyan-600" />
                    </div>
                    עיר
                  </div>
                  {isEditing ? (
                    <Input
                      value={editData.address_city}
                      onChange={(e) => setEditData({...editData, address_city: e.target.value})}
                      className="h-10 border-cyan-200 focus:border-cyan-500"
                    />
                  ) : (
                    <div className="font-semibold text-slate-900 bg-white rounded-lg px-4 py-2.5 border border-slate-200 group-hover:border-cyan-300 group-hover:shadow-md transition-all">
                      {lead.address_city || '-'}
                    </div>
                  )}
                </div>

                <div className="group">
                  <div className="text-xs font-medium text-blue-600 mb-2 flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-lg bg-blue-100 flex items-center justify-center">
                      <MapPin className="w-3 h-3 text-blue-600" />
                    </div>
                    רחוב
                  </div>
                  {isEditing ? (
                    <Input
                      value={editData.address_street}
                      onChange={(e) => setEditData({...editData, address_street: e.target.value})}
                      className="h-10 border-blue-200 focus:border-blue-500"
                    />
                  ) : (
                    <div className="font-semibold text-slate-900 bg-white rounded-lg px-4 py-2.5 border border-slate-200 group-hover:border-blue-300 group-hover:shadow-md transition-all">
                      {lead.address_street || '-'}
                    </div>
                  )}
                </div>

                <div className="group">
                  <div className="text-xs font-medium text-amber-600 mb-2 flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-lg bg-amber-100 flex items-center justify-center">
                      <Building2 className="w-3 h-3 text-amber-600" />
                    </div>
                    מס׳ בית
                  </div>
                  {isEditing ? (
                    <Input
                      value={editData.address_number}
                      onChange={(e) => setEditData({...editData, address_number: e.target.value})}
                      className="h-10 border-amber-200 focus:border-amber-500"
                    />
                  ) : (
                    <div className="font-semibold text-slate-900 bg-white rounded-lg px-4 py-2.5 border border-slate-200 group-hover:border-amber-300 group-hover:shadow-md transition-all">
                      {lead.address_number || '-'}
                    </div>
                  )}
                </div>
              </div>

              {/* Row 3: Building details */}
              <div className="grid grid-cols-3 gap-4">
                <div className="group">
                  <div className="text-xs font-medium text-orange-600 mb-2 flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-lg bg-orange-100 flex items-center justify-center">
                      <Building2 className="w-3 h-3 text-orange-600" />
                    </div>
                    פרטי בניין
                  </div>
                  {isEditing ? (
                    <Input
                      value={editData.building_details}
                      onChange={(e) => setEditData({...editData, building_details: e.target.value})}
                      className="h-10 border-orange-200 focus:border-orange-500"
                    />
                  ) : (
                    <div className="font-semibold text-slate-900 bg-white rounded-lg px-4 py-2.5 border border-slate-200 group-hover:border-orange-300 group-hover:shadow-md transition-all">
                      {lead.building_details || '-'}
                    </div>
                  )}
                </div>

                <div className="group">
                  <div className="text-xs font-medium text-teal-600 mb-2 flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-lg bg-teal-100 flex items-center justify-center">
                      <Building2 className="w-3 h-3 text-teal-600" />
                    </div>
                    קומה
                  </div>
                  {isEditing ? (
                    <Input
                      value={editData.building_floor}
                      onChange={(e) => setEditData({...editData, building_floor: e.target.value})}
                      className="h-10 border-teal-200 focus:border-teal-500"
                    />
                  ) : (
                    <div className="font-semibold text-slate-900 bg-white rounded-lg px-4 py-2.5 border border-slate-200 group-hover:border-teal-300 group-hover:shadow-md transition-all">
                      {lead.building_floor || '-'}
                    </div>
                  )}
                </div>

                <div className="group">
                  <div className="text-xs font-medium text-rose-600 mb-2 flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-lg bg-rose-100 flex items-center justify-center">
                      <Mail className="w-3 h-3 text-rose-600" />
                    </div>
                    אימייל
                  </div>
                  {isEditing ? (
                    <Input
                      value={editData.email}
                      onChange={(e) => setEditData({...editData, email: e.target.value})}
                      className="h-10 border-rose-200 focus:border-rose-500"
                      type="email"
                      dir="ltr"
                    />
                  ) : (
                    <div className="font-semibold text-slate-900 bg-white rounded-lg px-4 py-2.5 border border-slate-200 group-hover:border-rose-300 group-hover:shadow-md transition-all break-all" dir="ltr">
                      {lead.email || '-'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sales Section */}
        <Card className="shadow-xl border-0 overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-green-600 via-emerald-600 to-teal-600 text-white py-4">
            <CardTitle className="text-lg font-bold flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Target className="w-5 h-5" />
              </div>
              פרטי מכירה
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">
              {/* Row 1 */}
              <div className="grid grid-cols-3 gap-4">
                <div className="group">
                  <div className="text-xs font-medium text-blue-600 mb-2 flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-lg bg-blue-100 flex items-center justify-center">
                      <MapPin className="w-3 h-3 text-blue-600" />
                    </div>
                    מקור ליד *
                  </div>
                  {isEditing ? (
                    <Select value={editData.source} onValueChange={(val) => setEditData({...editData, source: val})}>
                      <SelectTrigger className={`h-10 ${errors.source ? 'border-red-500' : ''}`}>
                        <SelectValue placeholder="בחר מקור" />
                      </SelectTrigger>
                      <SelectContent>
                        {sourceOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="font-semibold text-slate-900 bg-white rounded-lg px-4 py-2.5 border border-slate-200">
                      {sourceOptions.find(s => s.value === lead.source)?.label || '-'}
                    </div>
                  )}
                </div>

                <div className="group">
                  <div className="text-xs font-medium text-purple-600 mb-2 flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-lg bg-purple-100 flex items-center justify-center">
                      <Flag className="w-3 h-3 text-purple-600" />
                    </div>
                    סטטוס *
                  </div>
                  {isEditing ? (
                    <Select value={editData.status} onValueChange={(val) => setEditData({...editData, status: val})}>
                      <SelectTrigger className={`h-10 ${errors.status ? 'border-red-500' : ''}`}>
                        <SelectValue placeholder="בחר סטטוס" />
                      </SelectTrigger>
                      <SelectContent>
                        {statusOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="font-semibold text-slate-900 bg-white rounded-lg px-4 py-2.5 border border-slate-200">
                      {statusOptions.find(s => s.value === lead.status)?.label || '-'}
                    </div>
                  )}
                </div>

                <div className="group">
                  <div className="text-xs font-medium text-orange-600 mb-2 flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-lg bg-orange-100 flex items-center justify-center">
                      <TrendingUp className="w-3 h-3 text-orange-600" />
                    </div>
                    דירוג ליד
                  </div>
                  {isEditing ? (
                    <Select value={editData.grade} onValueChange={(val) => setEditData({...editData, grade: val})}>
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="בחר דירוג" />
                      </SelectTrigger>
                      <SelectContent>
                        {gradeOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="font-semibold text-slate-900 bg-white rounded-lg px-4 py-2.5 border border-slate-200">
                      {gradeOptions.find(g => g.value === lead.grade)?.label || '-'}
                    </div>
                  )}
                </div>
              </div>

              {/* Row 2 */}
              <div className="grid grid-cols-3 gap-4">
                <div className="group">
                  <div className="text-xs font-medium text-indigo-600 mb-2 flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-lg bg-indigo-100 flex items-center justify-center">
                      <Users className="w-3 h-3 text-indigo-600" />
                    </div>
                    סוכן מטפל
                  </div>
                  {isEditing ? (
                    <Input
                      value={editData.owner_id}
                      onChange={(e) => setEditData({...editData, owner_id: e.target.value})}
                      className="h-10"
                    />
                  ) : (
                    <div className="font-semibold text-slate-900 bg-white rounded-lg px-4 py-2.5 border border-slate-200">
                      {lead.owner_id || '-'}
                    </div>
                  )}
                </div>

                <div className="group">
                  <div className="text-xs font-medium text-green-600 mb-2 flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-lg bg-green-100 flex items-center justify-center">
                      <DollarSign className="w-3 h-3 text-green-600" />
                    </div>
                    סכום פוטנציאלי
                  </div>
                  {isEditing ? (
                    <Input
                      type="number"
                      value={editData.deal_value}
                      onChange={(e) => setEditData({...editData, deal_value: e.target.value})}
                      className="h-10"
                      placeholder="₪"
                    />
                  ) : (
                    <div className="font-semibold text-green-700 bg-white rounded-lg px-4 py-2.5 border border-slate-200">
                      {lead.deal_value ? `₪${lead.deal_value.toLocaleString()}` : '-'}
                    </div>
                  )}
                </div>

                <div className="group">
                  <div className="text-xs font-medium text-cyan-600 mb-2 flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-lg bg-cyan-100 flex items-center justify-center">
                      <Target className="w-3 h-3 text-cyan-600" />
                    </div>
                    הסתברות סגירה
                  </div>
                  {isEditing ? (
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={editData.win_probability}
                      onChange={(e) => setEditData({...editData, win_probability: e.target.value})}
                      className="h-10"
                      placeholder="%"
                    />
                  ) : (
                    <div className="font-semibold text-slate-900 bg-white rounded-lg px-4 py-2.5 border border-slate-200">
                      {lead.win_probability ? `${lead.win_probability}%` : '-'}
                    </div>
                  )}
                </div>
              </div>

              {/* Row 3 */}
              <div className="grid grid-cols-3 gap-4">
                <div className="group">
                  <div className="text-xs font-medium text-amber-600 mb-2 flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-lg bg-amber-100 flex items-center justify-center">
                      <Calendar className="w-3 h-3 text-amber-600" />
                    </div>
                    תאריך צפי סגירה
                  </div>
                  {isEditing ? (
                    <Input
                      type="date"
                      value={editData.expected_close_date}
                      onChange={(e) => setEditData({...editData, expected_close_date: e.target.value})}
                      className="h-10"
                    />
                  ) : (
                    <div className="font-semibold text-slate-900 bg-white rounded-lg px-4 py-2.5 border border-slate-200">
                      {lead.expected_close_date ? format(new Date(lead.expected_close_date), 'dd/MM/yyyy') : '-'}
                    </div>
                  )}
                </div>

                <div className="group">
                  <div className="text-xs font-medium text-pink-600 mb-2 flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-lg bg-pink-100 flex items-center justify-center">
                      <Flag className="w-3 h-3 text-pink-600" />
                    </div>
                    קמפיין
                  </div>
                  {isEditing ? (
                    <Input
                      value={editData.campaign}
                      onChange={(e) => setEditData({...editData, campaign: e.target.value})}
                      className="h-10"
                    />
                  ) : (
                    <div className="font-semibold text-slate-900 bg-white rounded-lg px-4 py-2.5 border border-slate-200">
                      {lead.campaign || '-'}
                    </div>
                  )}
                </div>

                <div className="group">
                  <div className="text-xs font-medium text-violet-600 mb-2 flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-lg bg-violet-100 flex items-center justify-center">
                      <Building2 className="w-3 h-3 text-violet-600" />
                    </div>
                    מוצר מתעניין
                  </div>
                  {isEditing ? (
                    <Input
                      value={editData.interested_product}
                      onChange={(e) => setEditData({...editData, interested_product: e.target.value})}
                      className="h-10"
                    />
                  ) : (
                    <div className="font-semibold text-slate-900 bg-white rounded-lg px-4 py-2.5 border border-slate-200">
                      {lead.interested_product || '-'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Product Interest Section */}
        <Card className="shadow-xl border-0 overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 text-white py-4">
            <CardTitle className="text-lg font-bold flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <ShoppingBag className="w-5 h-5" />
              </div>
              במה הלקוח מעוניין
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">
              {/* Row 1 */}
              <div className="grid grid-cols-3 gap-4">
                <div className="group">
                  <div className="text-xs font-medium text-purple-600 mb-2 flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-lg bg-purple-100 flex items-center justify-center">
                      <Package className="w-3 h-3 text-purple-600" />
                    </div>
                    מוצר מתעניין
                  </div>
                  {isEditing ? (
                    <Input
                      value={editData.interested_product}
                      onChange={(e) => setEditData({...editData, interested_product: e.target.value})}
                      className="h-10"
                    />
                  ) : (
                    <div className="font-semibold text-slate-900 bg-white rounded-lg px-4 py-2.5 border border-slate-200">
                      {lead.interested_product || '-'}
                    </div>
                  )}
                </div>

                <div className="group">
                  <div className="text-xs font-medium text-pink-600 mb-2 flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-lg bg-pink-100 flex items-center justify-center">
                      <Package className="w-3 h-3 text-pink-600" />
                    </div>
                    סוג חבילה
                  </div>
                  {isEditing ? (
                    <Input
                      value={editData.package_type}
                      onChange={(e) => setEditData({...editData, package_type: e.target.value})}
                      className="h-10"
                    />
                  ) : (
                    <div className="font-semibold text-slate-900 bg-white rounded-lg px-4 py-2.5 border border-slate-200">
                      {lead.package_type || '-'}
                    </div>
                  )}
                </div>

                <div className="group">
                  <div className="text-xs font-medium text-rose-600 mb-2 flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-lg bg-rose-100 flex items-center justify-center">
                      <Target className="w-3 h-3 text-rose-600" />
                    </div>
                    צורך מרכזי
                  </div>
                  {isEditing ? (
                    <Input
                      value={editData.main_need}
                      onChange={(e) => setEditData({...editData, main_need: e.target.value})}
                      className="h-10"
                    />
                  ) : (
                    <div className="font-semibold text-slate-900 bg-white rounded-lg px-4 py-2.5 border border-slate-200">
                      {lead.main_need || '-'}
                    </div>
                  )}
                </div>
              </div>

              {/* Row 2 */}
              <div className="grid grid-cols-3 gap-4">
                <div className="group">
                  <div className="text-xs font-medium text-orange-600 mb-2 flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-lg bg-orange-100 flex items-center justify-center">
                      <AlertCircle className="w-3 h-3 text-orange-600" />
                    </div>
                    בעיה לפתור
                  </div>
                  {isEditing ? (
                    <Input
                      value={editData.problem_to_solve}
                      onChange={(e) => setEditData({...editData, problem_to_solve: e.target.value})}
                      className="h-10"
                    />
                  ) : (
                    <div className="font-semibold text-slate-900 bg-white rounded-lg px-4 py-2.5 border border-slate-200">
                      {lead.problem_to_solve || '-'}
                    </div>
                  )}
                </div>

                <div className="group">
                  <div className="text-xs font-medium text-green-600 mb-2 flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-lg bg-green-100 flex items-center justify-center">
                      <DollarSign className="w-3 h-3 text-green-600" />
                    </div>
                    תקציב משוער
                  </div>
                  {isEditing ? (
                    <Input
                      type="number"
                      value={editData.estimated_budget}
                      onChange={(e) => setEditData({...editData, estimated_budget: e.target.value})}
                      className="h-10"
                      placeholder="₪"
                    />
                  ) : (
                    <div className="font-semibold text-green-700 bg-white rounded-lg px-4 py-2.5 border border-slate-200">
                      {lead.estimated_budget ? `₪${lead.estimated_budget.toLocaleString()}` : '-'}
                    </div>
                  )}
                </div>

                <div className="group">
                  <div className="text-xs font-medium text-red-600 mb-2 flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-lg bg-red-100 flex items-center justify-center">
                      <Zap className="w-3 h-3 text-red-600" />
                    </div>
                    דחיפות
                  </div>
                  {isEditing ? (
                    <Select value={editData.urgency} onValueChange={(val) => setEditData({...editData, urgency: val})}>
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="בחר דחיפות" />
                      </SelectTrigger>
                      <SelectContent>
                        {urgencyOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="font-semibold text-slate-900 bg-white rounded-lg px-4 py-2.5 border border-slate-200">
                      {urgencyOptions.find(u => u.value === lead.urgency)?.label || '-'}
                    </div>
                  )}
                </div>
              </div>

              {/* Row 3 */}
              <div className="grid grid-cols-3 gap-4">
                <div className="group">
                  <div className="text-xs font-medium text-indigo-600 mb-2 flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-lg bg-indigo-100 flex items-center justify-center">
                      <Users className="w-3 h-3 text-indigo-600" />
                    </div>
                    מתחרים שבדק
                  </div>
                  {isEditing ? (
                    <Input
                      value={editData.competitors_checked}
                      onChange={(e) => setEditData({...editData, competitors_checked: e.target.value})}
                      className="h-10"
                    />
                  ) : (
                    <div className="font-semibold text-slate-900 bg-white rounded-lg px-4 py-2.5 border border-slate-200">
                      {lead.competitors_checked || '-'}
                    </div>
                  )}
                </div>

                <div className="group">
                  <div className="text-xs font-medium text-cyan-600 mb-2 flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-lg bg-cyan-100 flex items-center justify-center">
                      <Info className="w-3 h-3 text-cyan-600" />
                    </div>
                    מקור מידע
                  </div>
                  {isEditing ? (
                    <Input
                      value={editData.info_source}
                      onChange={(e) => setEditData({...editData, info_source: e.target.value})}
                      className="h-10"
                    />
                  ) : (
                    <div className="font-semibold text-slate-900 bg-white rounded-lg px-4 py-2.5 border border-slate-200">
                      {lead.info_source || '-'}
                    </div>
                  )}
                </div>

                <div className="group">
                  <div className="text-xs font-medium text-amber-600 mb-2 flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-lg bg-amber-100 flex items-center justify-center">
                      <AlertCircle className="w-3 h-3 text-amber-600" />
                    </div>
                    נקודת כאב
                  </div>
                  {isEditing ? (
                    <Input
                      value={editData.pain_point}
                      onChange={(e) => setEditData({...editData, pain_point: e.target.value})}
                      className="h-10"
                    />
                  ) : (
                    <div className="font-semibold text-slate-900 bg-white rounded-lg px-4 py-2.5 border border-slate-200">
                      {lead.pain_point || '-'}
                    </div>
                  )}
                </div>
              </div>

              {/* Row 4 */}
              <div className="grid grid-cols-3 gap-4">
                <div className="group">
                  <div className="text-xs font-medium text-emerald-600 mb-2 flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-lg bg-emerald-100 flex items-center justify-center">
                      <BarChart3 className="w-3 h-3 text-emerald-600" />
                    </div>
                    ROI משוער
                  </div>
                  {isEditing ? (
                    <Input
                      value={editData.expected_roi}
                      onChange={(e) => setEditData({...editData, expected_roi: e.target.value})}
                      className="h-10"
                    />
                  ) : (
                    <div className="font-semibold text-slate-900 bg-white rounded-lg px-4 py-2.5 border border-slate-200">
                      {lead.expected_roi || '-'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        {lead.notes && (
          <Card className="shadow-lg border-0 overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-amber-500 to-orange-600 text-white">
              <CardTitle className="text-base flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                  <FileText className="w-5 h-5" />
                </div>
                הערות
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed bg-amber-50 p-4 rounded-lg border border-amber-200">
                {lead.notes}
              </p>
            </CardContent>
          </Card>
        )}

        {/* System Info */}
        <Card className="shadow-md border-slate-200">
          <CardHeader className="bg-slate-50">
            <CardTitle className="text-sm flex items-center gap-2 text-slate-700">
              <Hash className="w-4 h-4" />
              מידע מערכת
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 gap-4 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <Hash className="w-3 h-3" />
                <span>מזהה: {lead.id}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-3 h-3" />
                <span>נוצר: {lead.created_date ? format(new Date(lead.created_date), 'dd/MM/yyyy HH:mm') : '-'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-3 h-3" />
                <span>עדכון: {lead.updated_date ? format(new Date(lead.updated_date), 'dd/MM/yyyy HH:mm') : '-'}</span>
              </div>
              <div className="flex items-center gap-2">
                <User className="w-3 h-3" />
                <span>יוצר: {lead.created_by || '-'}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <TimelineFeed leadId={lead.id} />
      </div>

      {/* AI Insights & Automation Sidebar - 4 columns */}
      <div className="col-span-4 space-y-4">
        <div className="sticky top-6 space-y-4">
          <AIAutomationEngine entityType="lead" entityId={lead.id} data={lead} autoRun={true} />
          <PredictiveAnalytics leadId={lead.id} lead={lead} />
          <AIInsightsPanel lead={lead} />
        </div>
      </div>
    </div>
  );
}

interface InfoRowProps {
  icon?: LucideIcon;
  label: string;
  value?: string | number;
  color?: string;
}

function InfoRow({ icon: Icon, label, value, color = 'slate' }: InfoRowProps) {
  if (!value) return null;

  const colorClasses: Record<string, string> = {
    slate: 'text-slate-600 bg-slate-100',
    indigo: 'text-indigo-600 bg-indigo-100',
    purple: 'text-purple-600 bg-purple-100',
    blue: 'text-blue-600 bg-blue-100',
    cyan: 'text-cyan-600 bg-cyan-100',
    emerald: 'text-emerald-600 bg-emerald-100',
    green: 'text-green-600 bg-green-100',
    teal: 'text-teal-600 bg-teal-100',
    amber: 'text-amber-600 bg-amber-100',
    orange: 'text-orange-600 bg-orange-100'
  };

  const colors = colorClasses[color] || colorClasses.slate;

  return (
    <div className="group">
      <div className="text-xs text-slate-500 mb-1.5 font-medium">{label}</div>
      <div className={`flex items-center gap-2 p-3 rounded-xl ${colors.split(' ')[1]} border border-transparent group-hover:shadow-md transition-all`}>
        {Icon && <Icon className={`w-4 h-4 ${colors.split(' ')[0]} flex-shrink-0`} />}
        <span className="font-semibold text-slate-800 text-sm truncate">{value}</span>
      </div>
    </div>
  );
}
