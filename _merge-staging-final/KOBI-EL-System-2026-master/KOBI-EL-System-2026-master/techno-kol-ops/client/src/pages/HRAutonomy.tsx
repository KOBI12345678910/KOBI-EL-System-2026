import React, { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { HR, seedHRDemoData, getHRSnapshot, wireHRToDataFlow } from '../engines/hrAutonomyEngine';
import type {
  Employee, JobOpening, LeaveRequest,
  OnboardingChecklist, PayrollEntry,
} from '../engines/hrAutonomyEngine';

// ═══════════════════════════════════════════════════════════════════════════
// THEME — Onyx dark palette
// ═══════════════════════════════════════════════════════════════════════════

const COLORS = {
  bg: '#252A31', panel: '#2F343C', panelAlt: '#383E47', input: '#383E47',
  border: 'rgba(255,255,255,0.1)', borderStrong: 'rgba(255,255,255,0.18)',
  text: '#F6F7F9', textMuted: '#ABB3BF', textDim: '#5C7080',
  accent: '#FFA500', cyan: '#14CCBB', yellow: '#F6B64A', red: '#FC8585',
  purple: '#8B7FFF', blue: '#48AFF0',
};

const STATUS_COLORS: Record<string, string> = {
  active: COLORS.cyan, probation: COLORS.yellow, onboarding: COLORS.accent,
  suspended: COLORS.red, terminated: COLORS.red, resigned: COLORS.red,
  retired: COLORS.red, notice_period: COLORS.yellow, candidate: COLORS.textDim,
};

const STATUS_LABELS: Record<string, string> = {
  active: 'פעיל', probation: 'ניסיון', onboarding: 'בקליטה',
  suspended: 'מושהה', terminated: 'פוטר', resigned: 'התפטר',
  retired: 'פרש', notice_period: 'הודעה מוקדמת', candidate: 'מועמד',
};

const SEVERITY_COLORS = {
  critical: { fg: COLORS.red, bg: 'rgba(252,133,133,0.15)', icon: '🔴' },
  warning: { fg: COLORS.yellow, bg: 'rgba(246,182,74,0.15)', icon: '🟡' },
  info: { fg: COLORS.cyan, bg: 'rgba(20,204,187,0.12)', icon: 'ℹ️' },
};

const CATEGORY_LABELS: Record<string, string> = {
  documents: 'מסמכים', equipment: 'ציוד', training: 'הדרכות',
  access: 'גישות', introduction: 'היכרות', safety: 'בטיחות', admin: 'אדמין',
};

const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: 'שנתית', sick: 'מחלה', personal: 'אישית', unpaid: 'לא בתשלום',
  military: 'מילואים', maternity: 'לידה', paternity: 'אבהות', bereavement: 'אבל',
};

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Heebo", sans-serif';

const s: Record<string, CSSProperties> = {
  page: { direction: 'rtl', fontFamily: FONT, background: COLORS.bg, color: COLORS.text, minHeight: '100vh', padding: 20, boxSizing: 'border-box' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, paddingBottom: 14, borderBottom: `1px solid ${COLORS.border}` },
  headerTitleWrap: { display: 'flex', flexDirection: 'column', gap: 6 },
  title: { fontSize: 26, fontWeight: 700, color: COLORS.text, margin: 0, letterSpacing: 0.2 },
  subtitle: { fontSize: 13, color: COLORS.textMuted, margin: 0 },
  liveDot: { display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: COLORS.cyan, marginLeft: 6, boxShadow: `0 0 6px ${COLORS.cyan}` },
  kpiStrip: { display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 10, marginBottom: 16 },
  kpiCard: { background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
  kpiLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: 500, letterSpacing: 0.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  kpiValue: { fontSize: 22, fontWeight: 700, color: COLORS.text, lineHeight: 1.1 },
  kpiHint: { fontSize: 10, color: COLORS.textDim },
  tabBar: { display: 'flex', gap: 4, marginBottom: 16, borderBottom: `1px solid ${COLORS.border}` },
  tabBtn: { background: 'transparent', color: COLORS.textMuted, border: 'none', padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', borderBottom: '2px solid transparent', fontFamily: 'inherit', transition: 'all 0.15s ease' },
  tabBtnActive: { color: COLORS.accent, borderBottom: `2px solid ${COLORS.accent}` },
  panel: { background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 16, marginBottom: 14 },
  panelHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  panelTitle: { fontSize: 15, fontWeight: 600, color: COLORS.text, margin: 0 },
  panelMeta: { fontSize: 12, color: COLORS.textMuted },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  thead: { background: COLORS.panelAlt },
  th: { textAlign: 'right' as const, padding: '10px 12px', fontSize: 11, fontWeight: 600, color: COLORS.textMuted, textTransform: 'uppercase' as const, letterSpacing: 0.5, borderBottom: `1px solid ${COLORS.border}` },
  td: { padding: '10px 12px', color: COLORS.text, borderBottom: `1px solid ${COLORS.border}` },
  chip: { display: 'inline-block', padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600 },
  pill: { display: 'inline-block', padding: '2px 8px', margin: '2px 2px 2px 0', borderRadius: 10, fontSize: 10, background: COLORS.panelAlt, color: COLORS.textMuted, border: `1px solid ${COLORS.border}` },
  input: { background: COLORS.input, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: '8px 12px', fontSize: 13, fontFamily: 'inherit', minWidth: 0, boxSizing: 'border-box', width: '100%' },
  select: { background: COLORS.input, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: '8px 12px', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' },
  btn: { background: COLORS.accent, color: '#1a1a1a', border: 'none', padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  btnGhost: { background: 'transparent', color: COLORS.textMuted, border: `1px solid ${COLORS.border}`, padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  btnGreen: { background: COLORS.cyan, color: '#1a1a1a', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  btnRed: { background: COLORS.red, color: '#1a1a1a', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  threeCol: { display: 'grid', gridTemplateColumns: '2fr 3fr', gap: 14 },
  cardGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 },
  subCard: { background: COLORS.panelAlt, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 12, cursor: 'pointer', transition: 'border-color 0.15s ease' },
  barRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  barLabel: { width: 110, fontSize: 12, color: COLORS.textMuted, textAlign: 'right' as const },
  barTrack: { flex: 1, height: 18, background: COLORS.panelAlt, borderRadius: 4, overflow: 'hidden', position: 'relative' },
  barFill: { height: '100%', background: COLORS.accent, borderRadius: 4, transition: 'width 0.4s ease' },
  barCount: { width: 40, fontSize: 12, fontWeight: 600, color: COLORS.text, textAlign: 'left' as const },
  emptyState: { padding: 24, textAlign: 'center' as const, color: COLORS.textDim, fontSize: 13 },
  sidePanel: { background: COLORS.panelAlt, border: `1px solid ${COLORS.borderStrong}`, borderRadius: 10, padding: 16, maxHeight: 700, overflowY: 'auto' },
  banner: { padding: '12px 16px', borderRadius: 8, marginBottom: 14, fontSize: 13, fontWeight: 600, border: `1px solid ${COLORS.red}`, background: 'rgba(252,133,133,0.12)', color: COLORS.red },
  label: { fontSize: 11, color: COLORS.textMuted, fontWeight: 500, textTransform: 'uppercase' as const, letterSpacing: 0.4, marginBottom: 4, display: 'block' },
  row: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 },
  scoreRow: { display: 'grid', gridTemplateColumns: '110px 1fr 40px', gap: 10, alignItems: 'center', marginBottom: 8 },
  section: { marginBottom: 12 },
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

const ils = (n: number): string => `₪${(n ?? 0).toLocaleString('he-IL')}`;

const fmtDate = (dateStr?: string): string => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

const yearsAt = (startDate: string): number => {
  if (!startDate) return 0;
  const start = new Date(startDate).getTime();
  if (isNaN(start)) return 0;
  return Math.round(((Date.now() - start) / (365.25 * 86400000)) * 10) / 10;
};

const statusChip = (status: string): CSSProperties => {
  const c = STATUS_COLORS[status] ?? COLORS.textDim;
  return { ...s.chip, background: `${c}22`, color: c, border: `1px solid ${c}55` };
};

const currentMonth = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

type TabKey = 'dashboard' | 'employees' | 'recruitment' | 'onboarding' | 'attendance' | 'payroll' | 'performance' | 'compliance';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'dashboard', label: 'דשבורד' },
  { key: 'employees', label: 'עובדים' },
  { key: 'recruitment', label: 'גיוס' },
  { key: 'onboarding', label: 'קליטה' },
  { key: 'attendance', label: 'נוכחות וחופשות' },
  { key: 'payroll', label: 'שכר' },
  { key: 'performance', label: 'הערכות ומשמעת' },
  { key: 'compliance', label: 'ציות' },
];

export function HRAutonomy() {
  const [snap, setSnap] = useState(() => getHRSnapshot());
  const [tab, setTab] = useState<TabKey>('dashboard');
  const [empSearch, setEmpSearch] = useState('');
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);
  const [selectedOpeningId, setSelectedOpeningId] = useState<string | null>(null);
  const [payrollMonth, setPayrollMonth] = useState<string>(currentMonth());
  const [payrollTick, setPayrollTick] = useState(0);

  // Recruitment inline forms
  const [candName, setCandName] = useState('');
  const [candPhone, setCandPhone] = useState('');
  const [candSource, setCandSource] = useState('מודעה');
  const [intInterviewer, setIntInterviewer] = useState('');
  const [intNotes, setIntNotes] = useState('');
  const [intRating, setIntRating] = useState(4);
  const [intRec, setIntRec] = useState<'hire' | 'maybe' | 'reject'>('hire');
  const [selectedCandId, setSelectedCandId] = useState<string | null>(null);
  const [offerSalary, setOfferSalary] = useState(12000);

  // Performance form
  const [reviewEmpId, setReviewEmpId] = useState('');
  const [reviewPeriod, setReviewPeriod] = useState('Q2 2026');
  const [reviewScores, setReviewScores] = useState({ quality: 4, productivity: 4, teamwork: 4, reliability: 4, initiative: 4, safety: 4 });
  const [reviewStrengths, setReviewStrengths] = useState('');
  const [reviewImprovements, setReviewImprovements] = useState('');
  const [reviewGoals, setReviewGoals] = useState('');
  const [reviewComments, setReviewComments] = useState('');

  // Mount — seed + wire + poll
  useEffect(() => {
    seedHRDemoData();
    wireHRToDataFlow();
    setSnap(getHRSnapshot());
    const id = setInterval(() => setSnap(getHRSnapshot()), 3000);
    return () => clearInterval(id);
  }, []);

  const dashboard = snap.dashboard;
  const selectedEmployee = useMemo(() => selectedEmpId ? snap.employees.find(e => e.id === selectedEmpId) ?? null : null, [selectedEmpId, snap.employees]);
  const selectedOpening = useMemo(() => selectedOpeningId ? snap.openings.find(o => o.id === selectedOpeningId) ?? null : null, [selectedOpeningId, snap.openings]);
  const employeesFiltered = useMemo(() => empSearch.trim() ? HR.employees.search(empSearch.trim()) : snap.employees, [empSearch, snap.employees]);

  const pendingLeaves = useMemo(() => {
    const list: Array<{ emp: Employee; req: LeaveRequest }> = [];
    for (const emp of snap.activeEmployees)
      for (const req of emp.leave.history)
        if (req.status === 'pending') list.push({ emp, req });
    return list;
  }, [snap.activeEmployees]);

  const todayAbsent = useMemo(() => HR.attendance.getTodayAbsent(snap.activeEmployees.map(e => e.id)), [snap.activeEmployees]);

  const payrollReport = useMemo(() => { void payrollTick; return HR.payroll.getMonthlyReport(payrollMonth); }, [payrollMonth, payrollTick, snap]);

  // Actions
  const handleApproveLeave = (emp: Employee, reqId: string) => { HR.leaves.approveLeave(emp, reqId, 'קורין'); setSnap(getHRSnapshot()); };
  const handleRejectLeave = (emp: Employee, reqId: string) => { HR.leaves.rejectLeave(emp, reqId, 'קורין', 'לא אושרה'); setSnap(getHRSnapshot()); };
  const handleClockIn = (empId: string) => { HR.attendance.clockIn(empId); setSnap(getHRSnapshot()); };
  const handleCompleteOnboardingItem = (empId: string, idx: number) => { HR.onOffboarding.completeOnboardingItem(empId, idx, 'קורין'); setSnap(getHRSnapshot()); };

  const handleAddCandidate = () => {
    if (!selectedOpeningId || !candName || !candPhone) return;
    HR.recruitment.addCandidate(selectedOpeningId, { name: candName, phone: candPhone, source: candSource });
    setCandName(''); setCandPhone('');
    setSnap(getHRSnapshot());
  };

  const handleRecordInterview = () => {
    if (!selectedOpeningId || !selectedCandId || !intInterviewer) return;
    HR.recruitment.recordInterview(selectedOpeningId, selectedCandId, {
      date: new Date().toISOString().split('T')[0], interviewer: intInterviewer,
      notes: intNotes, rating: intRating, recommendation: intRec,
    });
    setIntNotes(''); setIntInterviewer('');
    setSnap(getHRSnapshot());
  };

  const handleMakeOffer = () => {
    if (!selectedOpeningId || !selectedCandId) return;
    HR.recruitment.makeOffer(selectedOpeningId, selectedCandId, offerSalary);
    setSnap(getHRSnapshot());
  };

  const handleHire = () => {
    if (!selectedOpeningId || !selectedCandId) return;
    const idNum = String(Math.floor(100000000 + Math.random() * 900000000));
    HR.hireFromRecruitment(selectedOpeningId, selectedCandId, {
      idNumber: idNum,
      startDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      baseSalary: offerSalary, manager: 'דימה',
    });
    setSelectedCandId(null);
    setSnap(getHRSnapshot());
  };

  const handleCalcPayroll = (emp: Employee) => {
    HR.payroll.calculate(emp, payrollMonth, { totalHours: 186, overtimeHours: 0, sickDays: 0, absentDays: 0 });
    setPayrollTick(t => t + 1);
    setSnap(getHRSnapshot());
  };

  const handleCalcAllPayroll = () => {
    for (const emp of snap.activeEmployees) {
      const existing = HR.payroll.getByEmployee(emp.id).find(p => p.period === payrollMonth);
      if (!existing)
        HR.payroll.calculate(emp, payrollMonth, { totalHours: 186, overtimeHours: 0, sickDays: 0, absentDays: 0 });
    }
    setPayrollTick(t => t + 1);
    setSnap(getHRSnapshot());
  };

  const handleApprovePayroll = (entryId: string) => { HR.payroll.approve(entryId); setPayrollTick(t => t + 1); setSnap(getHRSnapshot()); };
  const handleMarkPaid = (entryId: string) => { HR.payroll.markPaid(entryId); setPayrollTick(t => t + 1); setSnap(getHRSnapshot()); };

  const handleCreateReview = () => {
    if (!reviewEmpId) return;
    const emp = snap.employees.find(e => e.id === reviewEmpId);
    if (!emp) return;
    HR.performance.createReview(emp, {
      period: reviewPeriod, reviewerId: 'kobi', reviewerName: 'קובי',
      scores: { ...reviewScores, overall: 0 },
      strengths: reviewStrengths.split('\n').filter(Boolean),
      improvements: reviewImprovements.split('\n').filter(Boolean),
      goals: reviewGoals.split('\n').filter(Boolean).map(g => ({ goal: g, deadline: '2026-12-31' })),
      comments: reviewComments,
    });
    setReviewStrengths(''); setReviewImprovements(''); setReviewGoals(''); setReviewComments('');
    setSnap(getHRSnapshot());
  };

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.headerTitleWrap}>
          <h1 style={s.title}>משאבי אנוש אוטונומי <span style={s.liveDot} /></h1>
          <p style={s.subtitle}>מחזור חיי העובד המלא — גיוס, קליטה, נוכחות, שכר, הערכה, ציות</p>
        </div>
        <button style={s.btn} onClick={() => { HR.printDashboard(); HR.printComplianceReport(); }}>📋 הדפס דוח</button>
      </div>

      {/* KPI Strip */}
      <div style={s.kpiStrip}>
        <KpiCard label='סה"כ עובדים' value={dashboard.totalEmployees} />
        <KpiCard label="פעילים" value={dashboard.activeEmployees} color={COLORS.cyan} />
        <KpiCard label="בקליטה" value={dashboard.onboardingCount} color={COLORS.accent} />
        <KpiCard label="משרות פתוחות" value={dashboard.openPositions} color={COLORS.blue} />
        <KpiCard label="חופשות ממתינות" value={dashboard.pendingLeaves} color={COLORS.yellow} />
        <KpiCard label="בעיות ציות" value={`${dashboard.complianceIssues}`} hint={`${dashboard.criticalIssues} קריטיות`} color={dashboard.criticalIssues > 0 ? COLORS.red : COLORS.cyan} />
        <KpiCard label="שכר ממוצע" value={ils(dashboard.avgSalary)} color={COLORS.cyan} />
        <KpiCard label="שכר חודשי כולל" value={ils(dashboard.totalPayroll)} color={COLORS.accent} />
      </div>

      {/* Tabs */}
      <div style={s.tabBar}>
        {TABS.map(t => (
          <button key={t.key} style={{ ...s.tabBtn, ...(tab === t.key ? s.tabBtnActive : {}) }} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && <DashboardTab d={dashboard} />}
      {tab === 'employees' && (
        <EmployeesTab
          employees={employeesFiltered}
          empSearch={empSearch} setEmpSearch={setEmpSearch}
          selectedEmployee={selectedEmployee}
          setSelectedEmpId={setSelectedEmpId}
        />
      )}
      {tab === 'recruitment' && (
        <RecruitmentTab
          openings={snap.openings}
          selectedOpening={selectedOpening}
          setSelectedOpeningId={setSelectedOpeningId}
          candName={candName} setCandName={setCandName}
          candPhone={candPhone} setCandPhone={setCandPhone}
          candSource={candSource} setCandSource={setCandSource}
          handleAddCandidate={handleAddCandidate}
          selectedCandId={selectedCandId} setSelectedCandId={setSelectedCandId}
          intInterviewer={intInterviewer} setIntInterviewer={setIntInterviewer}
          intNotes={intNotes} setIntNotes={setIntNotes}
          intRating={intRating} setIntRating={setIntRating}
          intRec={intRec} setIntRec={setIntRec}
          handleRecordInterview={handleRecordInterview}
          handleMakeOffer={handleMakeOffer}
          handleHire={handleHire}
          offerSalary={offerSalary} setOfferSalary={setOfferSalary}
        />
      )}
      {tab === 'onboarding' && (
        <OnboardingTab employees={snap.employees} overdue={snap.overdueOnboardings} handleCompleteOnboardingItem={handleCompleteOnboardingItem} />
      )}
      {tab === 'attendance' && (
        <AttendanceTab
          employees={snap.activeEmployees}
          absent={todayAbsent}
          pendingLeaves={pendingLeaves}
          handleApproveLeave={handleApproveLeave}
          handleRejectLeave={handleRejectLeave}
          handleClockIn={handleClockIn}
        />
      )}
      {tab === 'payroll' && (
        <PayrollTab
          employees={snap.activeEmployees}
          report={payrollReport}
          payrollMonth={payrollMonth} setPayrollMonth={setPayrollMonth}
          handleCalcPayroll={handleCalcPayroll}
          handleCalcAllPayroll={handleCalcAllPayroll}
          handleApprovePayroll={handleApprovePayroll}
          handleMarkPaid={handleMarkPaid}
        />
      )}
      {tab === 'performance' && (
        <PerformanceTab
          employees={snap.activeEmployees}
          reviewEmpId={reviewEmpId} setReviewEmpId={setReviewEmpId}
          reviewPeriod={reviewPeriod} setReviewPeriod={setReviewPeriod}
          reviewScores={reviewScores} setReviewScores={setReviewScores}
          reviewStrengths={reviewStrengths} setReviewStrengths={setReviewStrengths}
          reviewImprovements={reviewImprovements} setReviewImprovements={setReviewImprovements}
          reviewGoals={reviewGoals} setReviewGoals={setReviewGoals}
          reviewComments={reviewComments} setReviewComments={setReviewComments}
          handleCreateReview={handleCreateReview}
        />
      )}
      {tab === 'compliance' && <ComplianceTab issues={snap.complianceIssues} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARED SMALL COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function KpiCard({ label, value, hint, color }: { label: string; value: React.ReactNode; hint?: string; color?: string }) {
  return (
    <div style={s.kpiCard}>
      <div style={s.kpiLabel}>{label}</div>
      <div style={{ ...s.kpiValue, color: color ?? COLORS.text }}>{value}</div>
      {hint && <div style={s.kpiHint}>{hint}</div>}
    </div>
  );
}

function InfoBlock({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: COLORS.panelAlt, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 14 }}>
      <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function LeaveBalanceBox({ title, used, remaining }: { title: string; used: number; remaining: number }) {
  return (
    <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: 8 }}>
      <div style={{ fontSize: 10, color: COLORS.textMuted }}>{title}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.cyan }}>{remaining}</div>
      <div style={{ fontSize: 10, color: COLORS.textDim }}>נוצלו {used}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 1: DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════

function DashboardTab({ d }: { d: ReturnType<typeof HR.getDashboard> }) {
  const maxDept = Math.max(1, ...Object.values(d.byDepartment));
  const statusEntries = Object.entries(d.byStatus).filter(([, c]) => c > 0);
  return (
    <div>
      <div style={s.twoCol}>
        <div style={s.panel}>
          <div style={s.panelHeader}>
            <h3 style={s.panelTitle}>עובדים לפי מחלקה</h3>
            <span style={s.panelMeta}>{Object.keys(d.byDepartment).length} מחלקות</span>
          </div>
          {Object.entries(d.byDepartment).sort((a, b) => b[1] - a[1]).map(([dept, count]) => (
            <div key={dept} style={s.barRow}>
              <div style={s.barLabel}>{dept}</div>
              <div style={s.barTrack}>
                <div style={{ ...s.barFill, width: `${(count / maxDept) * 100}%` }} />
              </div>
              <div style={s.barCount}>{count}</div>
            </div>
          ))}
          {Object.keys(d.byDepartment).length === 0 && <div style={s.emptyState}>אין נתונים</div>}
        </div>

        <div style={s.panel}>
          <div style={s.panelHeader}>
            <h3 style={s.panelTitle}>סטטוס עובדים</h3>
            <span style={s.panelMeta}>{d.totalEmployees} סה"כ</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {statusEntries.map(([status, count]) => {
              const color = STATUS_COLORS[status] ?? COLORS.textDim;
              return (
                <div key={status} style={{ background: `${color}22`, border: `1px solid ${color}55`, borderRadius: 10, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 100 }}>
                  <div style={{ fontSize: 11, color: COLORS.textMuted }}>{STATUS_LABELS[status] ?? status}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color }}>{count}</div>
                </div>
              );
            })}
            {statusEntries.length === 0 && <div style={s.emptyState}>אין עובדים במערכת</div>}
          </div>
        </div>
      </div>

      <div style={s.panel}>
        <div style={s.panelHeader}><h3 style={s.panelTitle}>סיכום מהיר</h3></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <InfoBlock label="משרות פתוחות" value={String(d.openPositions)} color={COLORS.blue} />
          <InfoBlock label="חופשות ממתינות לאישור" value={String(d.pendingLeaves)} color={COLORS.yellow} />
          <InfoBlock label="בעיות קריטיות" value={String(d.criticalIssues)} color={d.criticalIssues > 0 ? COLORS.red : COLORS.cyan} />
          <InfoBlock label="סה״כ בעיות ציות" value={String(d.complianceIssues)} color={COLORS.accent} />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 2: EMPLOYEES
// ═══════════════════════════════════════════════════════════════════════════

function EmployeesTab(p: {
  employees: Employee[]; empSearch: string; setEmpSearch: (v: string) => void;
  selectedEmployee: Employee | null; setSelectedEmpId: (id: string | null) => void;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: p.selectedEmployee ? '2fr 1fr' : '1fr', gap: 14 }}>
      <div style={s.panel}>
        <div style={s.panelHeader}>
          <h3 style={s.panelTitle}>עובדים ({p.employees.length})</h3>
          <input
            style={{ ...s.input, maxWidth: 280 }}
            placeholder="חיפוש: שם / ת.ז / טלפון / תפקיד..."
            value={p.empSearch} onChange={e => p.setEmpSearch(e.target.value)}
          />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={s.table}>
            <thead style={s.thead}>
              <tr>
                <th style={s.th}>שם</th>
                <th style={s.th}>מחלקה</th>
                <th style={s.th}>תפקיד</th>
                <th style={s.th}>סטטוס</th>
                <th style={s.th}>שכר בסיס</th>
                <th style={s.th}>תאריך התחלה</th>
                <th style={s.th}>שנים</th>
              </tr>
            </thead>
            <tbody>
              {p.employees.map(e => (
                <tr key={e.id} onClick={() => p.setSelectedEmpId(e.id)}
                    style={{ cursor: 'pointer', background: p.selectedEmployee?.id === e.id ? COLORS.panelAlt : 'transparent' }}>
                  <td style={s.td}>{e.personal.fullName}</td>
                  <td style={s.td}>{e.employment.department}</td>
                  <td style={s.td}>{e.employment.position}</td>
                  <td style={s.td}><span style={statusChip(e.employment.status)}>{STATUS_LABELS[e.employment.status] ?? e.employment.status}</span></td>
                  <td style={s.td}>{ils(e.employment.salary.baseSalary)}</td>
                  <td style={s.td}>{fmtDate(e.employment.startDate)}</td>
                  <td style={s.td}>{yearsAt(e.employment.startDate)}</td>
                </tr>
              ))}
              {p.employees.length === 0 && (
                <tr><td colSpan={7} style={{ ...s.td, ...s.emptyState }}>לא נמצאו עובדים</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {p.selectedEmployee && (
        <div style={s.sidePanel}>
          <EmployeeDetail employee={p.selectedEmployee} onClose={() => p.setSelectedEmpId(null)} />
        </div>
      )}
    </div>
  );
}

function EmployeeDetail({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const lastReview = employee.reviews[employee.reviews.length - 1];
  const auditTail = employee.audit.slice(-6).reverse();
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
        <h3 style={s.panelTitle}>{employee.personal.fullName}</h3>
        <button style={s.btnGhost} onClick={onClose}>✕</button>
      </div>

      <div style={s.section}>
        <div style={s.label}>אישי</div>
        <div style={{ fontSize: 12, color: COLORS.textMuted, lineHeight: 1.9 }}>
          <div>ת.ז: {employee.personal.idNumber}</div>
          <div>טלפון: {employee.personal.phone}</div>
          {employee.personal.email && <div>מייל: {employee.personal.email}</div>}
          {employee.personal.address && <div>כתובת: {employee.personal.address}</div>}
        </div>
      </div>

      <div style={s.section}>
        <div style={s.label}>העסקה</div>
        <div style={{ fontSize: 12, color: COLORS.textMuted, lineHeight: 1.9 }}>
          <div>מחלקה: {employee.employment.department}</div>
          <div>תפקיד: {employee.employment.position}</div>
          <div>סטטוס: <span style={statusChip(employee.employment.status)}>{STATUS_LABELS[employee.employment.status] ?? employee.employment.status}</span></div>
          <div>תחילת עבודה: {fmtDate(employee.employment.startDate)} ({yearsAt(employee.employment.startDate)} שנים)</div>
          <div>שכר בסיס: {ils(employee.employment.salary.baseSalary)}</div>
        </div>
      </div>

      <div style={s.section}>
        <div style={s.label}>יתרות חופשה</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <LeaveBalanceBox title="שנתית" used={employee.leave.annual.used} remaining={employee.leave.annual.remaining} />
          <LeaveBalanceBox title="מחלה" used={employee.leave.sick.used} remaining={employee.leave.sick.remaining} />
          <LeaveBalanceBox title="אישית" used={employee.leave.personal.used} remaining={employee.leave.personal.remaining} />
        </div>
      </div>

      <div style={s.section}>
        <div style={s.label}>הערכה אחרונה</div>
        {lastReview ? (
          <div style={{ fontSize: 12, color: COLORS.textMuted, lineHeight: 1.8 }}>
            <div>תקופה: {lastReview.period}</div>
            <div>ציון כולל: <strong style={{ color: COLORS.cyan }}>{lastReview.scores.overall}/5</strong></div>
            <div>מעריך: {lastReview.reviewerName}</div>
            <div>תאריך: {fmtDate(lastReview.reviewDate)}</div>
          </div>
        ) : (<div style={{ fontSize: 12, color: COLORS.textDim }}>לא בוצעה הערכה</div>)}
      </div>

      <div style={s.section}>
        <div style={s.label}>משמעת</div>
        <div style={{ fontSize: 12, color: COLORS.textMuted }}>{employee.disciplinary.length} רשומות משמעת</div>
      </div>

      <div style={s.section}>
        <div style={s.label}>מיומנויות</div>
        <div>
          {employee.qualifications.skills.map(sk => <span key={sk} style={s.pill}>{sk}</span>)}
          {employee.qualifications.skills.length === 0 && <span style={{ fontSize: 12, color: COLORS.textDim }}>—</span>}
        </div>
      </div>

      <div style={s.section}>
        <div style={s.label}>Audit Trail</div>
        <div style={{ fontSize: 11, color: COLORS.textDim, lineHeight: 1.8 }}>
          {auditTail.map((a, i) => (
            <div key={i}><span style={{ color: COLORS.accent }}>{a.action}</span> — {a.detail}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 3: RECRUITMENT
// ═══════════════════════════════════════════════════════════════════════════

function RecruitmentTab(p: {
  openings: JobOpening[]; selectedOpening: JobOpening | null;
  setSelectedOpeningId: (id: string | null) => void;
  candName: string; setCandName: (v: string) => void;
  candPhone: string; setCandPhone: (v: string) => void;
  candSource: string; setCandSource: (v: string) => void;
  handleAddCandidate: () => void;
  selectedCandId: string | null; setSelectedCandId: (id: string | null) => void;
  intInterviewer: string; setIntInterviewer: (v: string) => void;
  intNotes: string; setIntNotes: (v: string) => void;
  intRating: number; setIntRating: (v: number) => void;
  intRec: 'hire' | 'maybe' | 'reject'; setIntRec: (v: 'hire' | 'maybe' | 'reject') => void;
  handleRecordInterview: () => void; handleMakeOffer: () => void; handleHire: () => void;
  offerSalary: number; setOfferSalary: (v: number) => void;
}) {
  const openOpenings = p.openings.filter(o => o.status !== 'filled' && o.status !== 'cancelled');
  return (
    <div style={s.threeCol}>
      <div style={s.panel}>
        <div style={s.panelHeader}>
          <h3 style={s.panelTitle}>משרות פתוחות</h3>
          <span style={s.panelMeta}>{openOpenings.length} / {p.openings.length}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {p.openings.map(o => {
            const isSelected = p.selectedOpening?.id === o.id;
            return (
              <div key={o.id} onClick={() => p.setSelectedOpeningId(o.id)}
                   style={{ ...s.subCard, borderColor: isSelected ? COLORS.accent : COLORS.border }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <strong style={{ fontSize: 14, color: COLORS.text }}>{o.title}</strong>
                  {o.urgent && <span style={{ ...s.chip, background: `${COLORS.red}22`, color: COLORS.red }}>🔴 דחוף</span>}
                </div>
                <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 6 }}>{o.department} · {o.location}</div>
                <div style={{ fontSize: 11, color: COLORS.textDim }}>שכר: {ils(o.salaryRange.min)} – {ils(o.salaryRange.max)}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <span style={{ ...s.pill, background: `${COLORS.blue}22`, color: COLORS.blue }}>{o.candidates.length} מועמדים</span>
                  <span style={{ ...s.pill, background: `${COLORS.accent}22`, color: COLORS.accent }}>{o.status}</span>
                </div>
              </div>
            );
          })}
          {p.openings.length === 0 && <div style={s.emptyState}>אין משרות פעילות</div>}
        </div>
      </div>

      <div style={s.panel}>
        {!p.selectedOpening ? (
          <div style={s.emptyState}>בחר משרה לצפייה במועמדים</div>
        ) : (
          <div>
            <div style={s.panelHeader}>
              <h3 style={s.panelTitle}>{p.selectedOpening.title}</h3>
              <span style={s.panelMeta}>{p.selectedOpening.candidates.length} מועמדים</span>
            </div>
            <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 12 }}>{p.selectedOpening.description}</div>

            <div style={{ marginBottom: 14 }}>
              <div style={s.label}>מועמדים</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {p.selectedOpening.candidates.map(c => {
                  const isSel = p.selectedCandId === c.id;
                  return (
                    <div key={c.id} onClick={() => p.setSelectedCandId(c.id)}
                         style={{ ...s.subCard, borderColor: isSel ? COLORS.cyan : COLORS.border }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <strong style={{ fontSize: 13, color: COLORS.text }}>{c.name}</strong>
                        <span style={{ fontSize: 11, color: COLORS.yellow }}>{'★'.repeat(Math.round(c.rating))} {c.rating || '—'}</span>
                      </div>
                      <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4 }}>{c.phone} · {c.source} · {c.status}</div>
                      {c.interviews.length > 0 && (
                        <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 4 }}>
                          {c.interviews.length} ראיונות · אחרון: {fmtDate(c.interviews[c.interviews.length - 1].date)}
                        </div>
                      )}
                      {c.offeredSalary && (
                        <div style={{ fontSize: 11, color: COLORS.accent, marginTop: 4 }}>הצעה: {ils(c.offeredSalary)}</div>
                      )}
                    </div>
                  );
                })}
                {p.selectedOpening.candidates.length === 0 && <div style={s.emptyState}>אין מועמדים עדיין</div>}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={s.label}>הוספת מועמד</div>
              <div style={s.formGrid}>
                <input style={s.input} placeholder="שם" value={p.candName} onChange={e => p.setCandName(e.target.value)} />
                <input style={s.input} placeholder="טלפון" value={p.candPhone} onChange={e => p.setCandPhone(e.target.value)} />
              </div>
              <div style={s.row}>
                <select style={s.select} value={p.candSource} onChange={e => p.setCandSource(e.target.value)}>
                  <option>מודעה</option><option>המלצה</option><option>פייסבוק</option><option>לינקדאין</option>
                </select>
                <button style={s.btn} onClick={p.handleAddCandidate}>+ הוסף מועמד</button>
              </div>
            </div>

            {p.selectedCandId && (
              <div style={{ marginBottom: 14 }}>
                <div style={s.label}>תיעוד ראיון</div>
                <div style={s.formGrid}>
                  <input style={s.input} placeholder="שם המראיין" value={p.intInterviewer} onChange={e => p.setIntInterviewer(e.target.value)} />
                  <select style={s.select} value={p.intRating} onChange={e => p.setIntRating(Number(e.target.value))}>
                    {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} ★</option>)}
                  </select>
                </div>
                <input style={{ ...s.input, marginBottom: 8 }} placeholder="הערות" value={p.intNotes} onChange={e => p.setIntNotes(e.target.value)} />
                <div style={s.row}>
                  <select style={s.select} value={p.intRec} onChange={e => p.setIntRec(e.target.value as 'hire' | 'maybe' | 'reject')}>
                    <option value="hire">לגייס</option>
                    <option value="maybe">אולי</option>
                    <option value="reject">לדחות</option>
                  </select>
                  <button style={s.btn} onClick={p.handleRecordInterview}>תעד ראיון</button>
                </div>
              </div>
            )}

            {p.selectedCandId && (
              <div>
                <div style={s.label}>הצעה וגיוס</div>
                <div style={s.row}>
                  <input type="number" style={{ ...s.input, maxWidth: 140 }} value={p.offerSalary} onChange={e => p.setOfferSalary(Number(e.target.value))} />
                  <button style={s.btn} onClick={p.handleMakeOffer}>שלח הצעה</button>
                  <button style={s.btnGreen} onClick={p.handleHire}>✓ קבל והעסק</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 4: ONBOARDING
// ═══════════════════════════════════════════════════════════════════════════

function OnboardingTab(p: {
  employees: Employee[]; overdue: OnboardingChecklist[];
  handleCompleteOnboardingItem: (empId: string, idx: number) => void;
}) {
  const onboardingEmps = p.employees.filter(e => e.employment.status === 'onboarding' || HR.onOffboarding.getOnboarding(e.id));
  return (
    <div>
      {p.overdue.length > 0 && (
        <div style={s.banner}>🔴 {p.overdue.length} תהליכי קליטה באיחור — דרושה התערבות מיידית</div>
      )}

      {onboardingEmps.length === 0 ? (
        <div style={{ ...s.panel, ...s.emptyState }}>אין תהליכי קליטה פעילים</div>
      ) : (
        <div style={s.cardGrid}>
          {onboardingEmps.map(emp => {
            const checklist = HR.onOffboarding.getOnboarding(emp.id);
            if (!checklist) return null;
            const isOverdue = p.overdue.some(o => o.employeeId === emp.id);
            const grouped: Record<string, Array<{ item: OnboardingChecklist['items'][number]; idx: number }>> = {};
            checklist.items.forEach((it, idx) => {
              if (!grouped[it.category]) grouped[it.category] = [];
              grouped[it.category].push({ item: it, idx });
            });
            return (
              <div key={emp.id} style={{ ...s.panel, borderColor: isOverdue ? COLORS.red : COLORS.border }}>
                <div style={s.panelHeader}>
                  <div>
                    <h3 style={s.panelTitle}>{emp.personal.fullName}</h3>
                    <div style={{ fontSize: 11, color: COLORS.textMuted }}>{emp.employment.position} · {emp.employment.department}</div>
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: checklist.completedPercent === 100 ? COLORS.cyan : COLORS.accent }}>
                      {checklist.completedPercent}%
                    </div>
                    {isOverdue && <span style={{ ...s.chip, background: `${COLORS.red}22`, color: COLORS.red }}>באיחור</span>}
                  </div>
                </div>

                <div style={s.barTrack}>
                  <div style={{ ...s.barFill, width: `${checklist.completedPercent}%`, background: checklist.completedPercent === 100 ? COLORS.cyan : COLORS.accent }} />
                </div>
                <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 6, marginBottom: 10 }}>יעד: {fmtDate(checklist.targetCompletionDate)}</div>

                {Object.entries(grouped).map(([cat, items]) => {
                  const done = items.filter(i => i.item.completed).length;
                  return (
                    <div key={cat} style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 600, marginBottom: 4 }}>
                        {CATEGORY_LABELS[cat] ?? cat} — {done}/{items.length}
                      </div>
                      {items.map(({ item, idx }) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: 11, color: item.completed ? COLORS.textDim : COLORS.text, textDecoration: item.completed ? 'line-through' : 'none' }}>
                          <span>{item.task}</span>
                          {!item.completed && (
                            <button style={{ ...s.btnGreen, padding: '3px 8px', fontSize: 10 }} onClick={() => p.handleCompleteOnboardingItem(emp.id, idx)}>✓</button>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 5: ATTENDANCE & LEAVES
// ═══════════════════════════════════════════════════════════════════════════

function AttendanceTab(p: {
  employees: Employee[]; absent: string[];
  pendingLeaves: Array<{ emp: Employee; req: LeaveRequest }>;
  handleApproveLeave: (emp: Employee, reqId: string) => void;
  handleRejectLeave: (emp: Employee, reqId: string) => void;
  handleClockIn: (empId: string) => void;
}) {
  return (
    <div>
      <div style={s.panel}>
        <div style={s.panelHeader}>
          <h3 style={s.panelTitle}>נוכחות היום</h3>
          <span style={s.panelMeta}>{p.employees.length - p.absent.length} נוכחים / {p.employees.length} סה"כ</span>
        </div>
        <div style={s.cardGrid}>
          {p.employees.map(emp => {
            const isAbsent = p.absent.includes(emp.id);
            return (
              <div key={emp.id} style={{ ...s.subCard, borderColor: isAbsent ? `${COLORS.red}55` : `${COLORS.cyan}55`, background: isAbsent ? `${COLORS.red}11` : `${COLORS.cyan}0a`, cursor: 'default' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>{emp.personal.fullName}</div>
                    <div style={{ fontSize: 11, color: COLORS.textMuted }}>{emp.employment.department}</div>
                  </div>
                  <div style={{ fontSize: 22 }}>{isAbsent ? '❌' : '✓'}</div>
                </div>
                {isAbsent && (
                  <button style={{ ...s.btnGreen, marginTop: 8, width: '100%' }} onClick={() => p.handleClockIn(emp.id)}>רשום נוכחות ידנית</button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={s.panel}>
        <div style={s.panelHeader}>
          <h3 style={s.panelTitle}>חופשות ממתינות לאישור</h3>
          <span style={s.panelMeta}>{p.pendingLeaves.length} בקשות</span>
        </div>
        {p.pendingLeaves.length === 0 ? (
          <div style={s.emptyState}>אין בקשות ממתינות</div>
        ) : (
          <table style={s.table}>
            <thead style={s.thead}>
              <tr>
                <th style={s.th}>עובד</th>
                <th style={s.th}>סוג</th>
                <th style={s.th}>מתאריך</th>
                <th style={s.th}>עד</th>
                <th style={s.th}>ימים</th>
                <th style={s.th}>סיבה</th>
                <th style={s.th}>פעולות</th>
              </tr>
            </thead>
            <tbody>
              {p.pendingLeaves.map(({ emp, req }) => (
                <tr key={req.id}>
                  <td style={s.td}>{emp.personal.fullName}</td>
                  <td style={s.td}>{LEAVE_TYPE_LABELS[req.type] ?? req.type}</td>
                  <td style={s.td}>{fmtDate(req.startDate)}</td>
                  <td style={s.td}>{fmtDate(req.endDate)}</td>
                  <td style={s.td}>{req.days}</td>
                  <td style={s.td}>{req.reason ?? '—'}</td>
                  <td style={s.td}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button style={s.btnGreen} onClick={() => p.handleApproveLeave(emp, req.id)}>✓ אשר</button>
                      <button style={s.btnRed} onClick={() => p.handleRejectLeave(emp, req.id)}>✕ דחה</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 6: PAYROLL
// ═══════════════════════════════════════════════════════════════════════════

function PayrollTab(p: {
  employees: Employee[];
  report: { entries: PayrollEntry[]; totalGross: number; totalNet: number; totalTax: number };
  payrollMonth: string; setPayrollMonth: (v: string) => void;
  handleCalcPayroll: (emp: Employee) => void;
  handleCalcAllPayroll: () => void;
  handleApprovePayroll: (entryId: string) => void;
  handleMarkPaid: (entryId: string) => void;
}) {
  const entryByEmpId = new Map<string, PayrollEntry>();
  for (const e of p.report.entries) entryByEmpId.set(e.employeeId, e);

  return (
    <div>
      <div style={s.panel}>
        <div style={s.panelHeader}>
          <h3 style={s.panelTitle}>חישוב שכר — {p.payrollMonth}</h3>
          <div style={s.row}>
            <input type="month" style={s.input} value={p.payrollMonth} onChange={e => p.setPayrollMonth(e.target.value)} />
            <button style={s.btn} onClick={p.handleCalcAllPayroll}>💰 חשב כל העובדים</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
          <InfoBlock label='סה"כ ברוטו' value={ils(p.report.totalGross)} color={COLORS.accent} />
          <InfoBlock label='סה"כ מיסים' value={ils(p.report.totalTax)} color={COLORS.yellow} />
          <InfoBlock label='סה"כ נטו' value={ils(p.report.totalNet)} color={COLORS.cyan} />
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={s.table}>
            <thead style={s.thead}>
              <tr>
                <th style={s.th}>עובד</th>
                <th style={s.th}>בסיס</th>
                <th style={s.th}>שעות נוספות</th>
                <th style={s.th}>תוספת שעות</th>
                <th style={s.th}>ברוטו</th>
                <th style={s.th}>הכנסה</th>
                <th style={s.th}>בל"ל</th>
                <th style={s.th}>בריאות</th>
                <th style={s.th}>פנסיה</th>
                <th style={s.th}>נטו</th>
                <th style={s.th}>סטטוס</th>
                <th style={s.th}>פעולות</th>
              </tr>
            </thead>
            <tbody>
              {p.employees.map(emp => {
                const entry = entryByEmpId.get(emp.id);
                const statusColor =
                  entry?.status === 'paid' ? COLORS.cyan :
                  entry?.status === 'approved' ? COLORS.yellow :
                  entry?.status === 'calculated' ? COLORS.accent : COLORS.textDim;
                return (
                  <tr key={emp.id}>
                    <td style={s.td}>{emp.personal.fullName}</td>
                    {entry ? (
                      <>
                        <td style={s.td}>{ils(entry.baseSalary)}</td>
                        <td style={s.td}>{entry.overtimeHours}</td>
                        <td style={s.td}>{ils(entry.overtimePay)}</td>
                        <td style={s.td}>{ils(entry.grossPay)}</td>
                        <td style={s.td}>{ils(entry.incomeTax)}</td>
                        <td style={s.td}>{ils(entry.nationalInsurance)}</td>
                        <td style={s.td}>{ils(entry.healthInsurance)}</td>
                        <td style={s.td}>{ils(entry.pension)}</td>
                        <td style={{ ...s.td, color: COLORS.cyan, fontWeight: 700 }}>{ils(entry.netPay)}</td>
                        <td style={s.td}>
                          <span style={{ ...s.chip, background: `${statusColor}22`, color: statusColor, border: `1px solid ${statusColor}55` }}>
                            {entry.status}
                          </span>
                        </td>
                        <td style={s.td}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            {entry.status === 'calculated' && (
                              <button style={{ ...s.btnGhost, padding: '4px 8px' }} onClick={() => p.handleApprovePayroll(entry.id)}>אשר</button>
                            )}
                            {entry.status === 'approved' && (
                              <button style={{ ...s.btnGreen, padding: '4px 8px' }} onClick={() => p.handleMarkPaid(entry.id)}>שולם</button>
                            )}
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={s.td}>{ils(emp.employment.salary.baseSalary)}</td>
                        <td colSpan={8} style={{ ...s.td, color: COLORS.textDim }}>לא חושב</td>
                        <td style={s.td}>
                          <span style={{ ...s.chip, background: `${COLORS.textDim}22`, color: COLORS.textDim }}>ממתין</span>
                        </td>
                        <td style={s.td}>
                          <button style={{ ...s.btn, padding: '4px 10px' }} onClick={() => p.handleCalcPayroll(emp)}>חשב</button>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
              {p.employees.length === 0 && (
                <tr><td colSpan={12} style={{ ...s.td, ...s.emptyState }}>אין עובדים פעילים</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 7: PERFORMANCE & DISCIPLINE
// ═══════════════════════════════════════════════════════════════════════════

type ReviewScoreState = { quality: number; productivity: number; teamwork: number; reliability: number; initiative: number; safety: number };

function PerformanceTab(p: {
  employees: Employee[];
  reviewEmpId: string; setReviewEmpId: (v: string) => void;
  reviewPeriod: string; setReviewPeriod: (v: string) => void;
  reviewScores: ReviewScoreState;
  setReviewScores: (v: ReviewScoreState) => void;
  reviewStrengths: string; setReviewStrengths: (v: string) => void;
  reviewImprovements: string; setReviewImprovements: (v: string) => void;
  reviewGoals: string; setReviewGoals: (v: string) => void;
  reviewComments: string; setReviewComments: (v: string) => void;
  handleCreateReview: () => void;
}) {
  const recentReviews = p.employees.map(emp => ({ emp, review: emp.reviews[emp.reviews.length - 1] })).filter(x => x.review);
  const allDisciplinary = p.employees.flatMap(emp => emp.disciplinary.map(d => ({ emp, disc: d }))).sort((a, b) => b.disc.date.localeCompare(a.disc.date));
  const scoreKeys: Array<[keyof ReviewScoreState, string]> = [
    ['quality', 'איכות'], ['productivity', 'פרודוקטיביות'], ['teamwork', 'עבודת צוות'],
    ['reliability', 'אמינות'], ['initiative', 'יוזמה'], ['safety', 'בטיחות'],
  ];

  return (
    <div>
      <div style={s.twoCol}>
        <div style={s.panel}>
          <div style={s.panelHeader}>
            <h3 style={s.panelTitle}>הערכות אחרונות</h3>
            <span style={s.panelMeta}>{recentReviews.length} עובדים</span>
          </div>
          {recentReviews.length === 0 ? (
            <div style={s.emptyState}>אין הערכות עדיין</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {recentReviews.map(({ emp, review }) => (
                <div key={emp.id} style={s.subCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <strong style={{ fontSize: 13, color: COLORS.text }}>{emp.personal.fullName}</strong>
                    <span style={{ ...s.chip, background: `${COLORS.cyan}22`, color: COLORS.cyan }}>{review.scores.overall}/5</span>
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 6 }}>
                    {review.period} · {review.reviewerName} · {fmtDate(review.reviewDate)}
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.textDim }}>{review.comments}</div>
                  {review.strengths.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      {review.strengths.map((st, i) => (
                        <span key={i} style={{ ...s.pill, background: `${COLORS.cyan}22`, color: COLORS.cyan }}>{st}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={s.panel}>
          <div style={s.panelHeader}>
            <h3 style={s.panelTitle}>משמעת</h3>
            <span style={s.panelMeta}>{allDisciplinary.length} רשומות</span>
          </div>
          {allDisciplinary.length === 0 ? (
            <div style={s.emptyState}>אין רשומות משמעת</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {allDisciplinary.map(({ emp, disc }) => {
                const severity =
                  disc.type === 'termination' || disc.type === 'suspension' || disc.type === 'final_warning' ? 'critical' :
                  disc.type === 'written_warning' ? 'warning' : 'info';
                const sc = SEVERITY_COLORS[severity];
                return (
                  <div key={disc.id} style={{ ...s.subCard, background: sc.bg }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <strong style={{ fontSize: 13, color: COLORS.text }}>{emp.personal.fullName}</strong>
                      <span style={{ ...s.chip, background: sc.bg, color: sc.fg }}>{disc.type}</span>
                    </div>
                    <div style={{ fontSize: 12, color: COLORS.text, marginBottom: 4 }}>{disc.reason}</div>
                    <div style={{ fontSize: 11, color: COLORS.textMuted }}>{disc.description}</div>
                    <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 6 }}>{fmtDate(disc.date)} · {disc.issuedBy}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div style={s.panel}>
        <div style={s.panelHeader}><h3 style={s.panelTitle}>הערכת ביצוע חדשה</h3></div>

        <div style={s.formGrid}>
          <div>
            <div style={s.label}>עובד</div>
            <select style={s.select} value={p.reviewEmpId} onChange={e => p.setReviewEmpId(e.target.value)}>
              <option value="">— בחר עובד —</option>
              {p.employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.personal.fullName} · {emp.employment.position}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={s.label}>תקופה</div>
            <input style={s.input} value={p.reviewPeriod} onChange={e => p.setReviewPeriod(e.target.value)} />
          </div>
        </div>

        <div style={s.label}>ציונים (1-5)</div>
        <div style={{ marginBottom: 12 }}>
          {scoreKeys.map(([key, label]) => (
            <div key={key} style={s.scoreRow}>
              <div style={{ fontSize: 12, color: COLORS.textMuted }}>{label}</div>
              <input type="range" min={1} max={5} value={p.reviewScores[key]}
                     onChange={e => p.setReviewScores({ ...p.reviewScores, [key]: Number(e.target.value) })}
                     style={{ width: '100%' }} />
              <div style={{ fontSize: 14, color: COLORS.cyan, fontWeight: 700, textAlign: 'center' }}>{p.reviewScores[key]}</div>
            </div>
          ))}
        </div>

        <div style={s.formGrid}>
          <div>
            <div style={s.label}>נקודות חוזק (שורה לכל אחת)</div>
            <textarea style={{ ...s.input, minHeight: 60, resize: 'vertical' as const }} value={p.reviewStrengths} onChange={e => p.setReviewStrengths(e.target.value)} />
          </div>
          <div>
            <div style={s.label}>נקודות לשיפור</div>
            <textarea style={{ ...s.input, minHeight: 60, resize: 'vertical' as const }} value={p.reviewImprovements} onChange={e => p.setReviewImprovements(e.target.value)} />
          </div>
        </div>
        <div style={s.formGrid}>
          <div>
            <div style={s.label}>יעדים</div>
            <textarea style={{ ...s.input, minHeight: 60, resize: 'vertical' as const }} value={p.reviewGoals} onChange={e => p.setReviewGoals(e.target.value)} />
          </div>
          <div>
            <div style={s.label}>הערות כלליות</div>
            <textarea style={{ ...s.input, minHeight: 60, resize: 'vertical' as const }} value={p.reviewComments} onChange={e => p.setReviewComments(e.target.value)} />
          </div>
        </div>

        <button style={s.btn} onClick={p.handleCreateReview}>💾 שמור הערכה</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 8: COMPLIANCE
// ═══════════════════════════════════════════════════════════════════════════

function ComplianceTab(p: {
  issues: Array<{ employeeId: string; employeeName: string; issue: string; severity: 'critical' | 'warning' | 'info'; recommendation: string }>;
}) {
  const critical = p.issues.filter(i => i.severity === 'critical');
  const warnings = p.issues.filter(i => i.severity === 'warning');
  const infos = p.issues.filter(i => i.severity === 'info');

  return (
    <div>
      {critical.length > 0 && (
        <div style={s.banner}>🔴 {critical.length} בעיות קריטיות — נדרש טיפול מיידי</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
        <InfoBlock label="קריטיות" value={String(critical.length)} color={COLORS.red} />
        <InfoBlock label="אזהרות" value={String(warnings.length)} color={COLORS.yellow} />
        <InfoBlock label="מידע" value={String(infos.length)} color={COLORS.cyan} />
      </div>

      <div style={s.panel}>
        <div style={s.panelHeader}>
          <h3 style={s.panelTitle}>דוח ציות מלא</h3>
          <span style={s.panelMeta}>{p.issues.length} בעיות</span>
        </div>
        {p.issues.length === 0 ? (
          <div style={s.emptyState}>✓ אין בעיות ציות — הכל תקין</div>
        ) : (
          <table style={s.table}>
            <thead style={s.thead}>
              <tr>
                <th style={s.th}>עובד</th>
                <th style={s.th}>סוג הבעיה</th>
                <th style={s.th}>חומרה</th>
                <th style={s.th}>המלצה</th>
              </tr>
            </thead>
            <tbody>
              {p.issues.map((issue, i) => {
                const sc = SEVERITY_COLORS[issue.severity];
                return (
                  <tr key={i}>
                    <td style={{ ...s.td, fontWeight: 600 }}>{issue.employeeName}</td>
                    <td style={s.td}>{issue.issue}</td>
                    <td style={s.td}>
                      <span style={{ ...s.chip, background: sc.bg, color: sc.fg, border: `1px solid ${sc.fg}55` }}>
                        {sc.icon} {issue.severity === 'critical' ? 'קריטי' : issue.severity === 'warning' ? 'אזהרה' : 'מידע'}
                      </span>
                    </td>
                    <td style={{ ...s.td, color: COLORS.textMuted, fontSize: 12 }}>{issue.recommendation}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
