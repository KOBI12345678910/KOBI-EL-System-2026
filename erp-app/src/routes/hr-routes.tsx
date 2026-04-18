import { Route, Redirect } from "wouter";
import { lazyPage } from "@/routes/lazy-utils";

const HRDashboard = lazyPage(() => import("@/pages/hr/hr-dashboard"));
const EmployeesListPage = lazyPage(() => import("@/pages/hr/employees-list"));
const EmployeePortfolio = lazyPage(() => import("@/pages/hr/employee-portfolio"));
const PayrollPage = lazyPage(() => import("@/pages/hr/payroll"));
const PayrollCenterPage = lazyPage(() => import("@/pages/hr/payroll-center"));
const AttendancePage = lazyPage(() => import("@/pages/hr/attendance"));
const ShiftsPage = lazyPage(() => import("@/pages/hr/shifts"));
const ContractorPaymentsPage = lazyPage(() => import("@/pages/hr/contractor-payments"));
const LeaveManagementPage = lazyPage(() => import("@/pages/hr/leave-management"));
const TrainingPage = lazyPage(() => import("@/pages/hr/training"));
const RecruitmentPage = lazyPage(() => import("@/pages/hr/recruitment"));
const PerformanceReviewsPage = lazyPage(() => import("@/pages/hr/performance-reviews"));
const OrgChartPage = lazyPage(() => import("@/pages/hr/org-chart"));
const HRSkillsMatrixPage = lazyPage(() => import("@/pages/hr/skills-matrix"));
const HRComplianceDashboardPage = lazyPage(() => import("@/pages/hr/compliance-dashboard"));
const BenefitsPage = lazyPage(() => import("@/pages/hr/benefits"));
const TalentManagementPage = lazyPage(() => import("@/pages/hr/talent-management"));
const TrainingManagementPage = lazyPage(() => import("@/pages/hr/training-management"));
const WorkforcePlanningPage = lazyPage(() => import("@/pages/hr/workforce-planning"));
const EmployeeSelfServicePage = lazyPage(() => import("@/pages/hr/employee-self-service"));
const ATSRecruitmentPage = lazyPage(() => import("@/pages/hr/ats-recruitment"));
const DepartmentsPage = lazyPage(() => import("@/pages/hr/departments"));
const HRMeetingsPage = lazyPage(() => import("@/pages/hr/hr-meetings"));
const OnboardingPage = lazyPage(() => import("@/pages/hr/onboarding"));
const HRPoliciesPage = lazyPage(() => import("@/pages/hr/policies"));
const PayslipsPage = lazyPage(() => import("@/pages/hr/payslips"));
const BonusesPage = lazyPage(() => import("@/pages/hr/bonuses"));
const EmployerCostPage = lazyPage(() => import("@/pages/hr/employer-cost"));
const PayrollEnginePage = lazyPage(() => import("@/pages/hr/payroll-engine"));
const LaborCostAllocationPage = lazyPage(() => import("@/pages/hr/labor-cost-allocation"));
const OpenPositionsPage = lazyPage(() => import("@/pages/hr/open-positions"));
const CandidatesPage = lazyPage(() => import("@/pages/hr/candidates"));
const InterviewsPage = lazyPage(() => import("@/pages/hr/interviews"));
const HRContractorContractsPage = lazyPage(() => import("@/pages/hr/contractor-contracts"));
const HRContractorInsurancePage = lazyPage(() => import("@/pages/hr/contractor-insurance"));
const HRContractorPaymentsPage = lazyPage(() => import("@/pages/hr/contractor-payments"));
const EmployeeCardPage = lazyPage(() => import("@/pages/hr/employee-card"));
const EmployeeGoalsPage = lazyPage(() => import("@/pages/hr/employee-goals"));
const EmploymentHistoryPage = lazyPage(() => import("@/pages/hr/employment-history"));
const HealthSafetyPage = lazyPage(() => import("@/pages/hr/health-safety"));
const HRExpenseClaimsPage = lazyPage(() => import("@/pages/hr/expense-claims"));
const WorkforceAnalysisPage = lazyPage(() => import("@/pages/workforce/workforce-analysis"));

export const HRRoutes = (

    <>
      <Route path="/hr" component={HRDashboard} />
      <Route path="/hr/employees" component={EmployeesListPage} />
      <Route path="/hr/employee-portfolio" component={EmployeePortfolio} />
      <Route path="/hr/employees/:id" component={EmployeePortfolio} />
      <Route path="/hr/payroll" component={PayrollPage} />
      <Route path="/hr/payroll-center" component={PayrollCenterPage} />
      <Route path="/hr/employee-value" component={WorkforceAnalysisPage} />
      <Route path="/hr/attendance" component={AttendancePage} />
      <Route path="/hr/gps-clock">
        <Redirect to="/hr/attendance" />
      </Route>
      <Route path="/hr/shifts" component={ShiftsPage} />
      <Route path="/hr/contractors" component={ContractorPaymentsPage} />
      <Route path="/hr/leave-management" component={LeaveManagementPage} />
      <Route path="/hr/leaves" component={LeaveManagementPage} />
      <Route path="/hr/training" component={TrainingPage} />
      <Route path="/hr/recruitment" component={RecruitmentPage} />
      <Route path="/hr/performance-reviews" component={PerformanceReviewsPage} />
      <Route path="/hr/org-chart" component={OrgChartPage} />
      <Route path="/hr/skills-matrix" component={HRSkillsMatrixPage} />
      <Route path="/hr/compliance-dashboard" component={HRComplianceDashboardPage} />
      <Route path="/hr/benefits" component={BenefitsPage} />
      <Route path="/hr/talent-management" component={TalentManagementPage} />
      <Route path="/hr/training-management" component={TrainingManagementPage} />
      <Route path="/hr/workforce-planning" component={WorkforcePlanningPage} />
      <Route path="/hr/self-service" component={EmployeeSelfServicePage} />
      <Route path="/hr/ats" component={ATSRecruitmentPage} />
      <Route path="/hr/departments" component={DepartmentsPage} />
      <Route path="/hr/meetings" component={HRMeetingsPage} />
      <Route path="/hr/onboarding" component={OnboardingPage} />
      <Route path="/hr/policies" component={HRPoliciesPage} />
      <Route path="/hr/payslips" component={PayslipsPage} />
      <Route path="/hr/bonuses" component={BonusesPage} />
      <Route path="/hr/employer-cost" component={EmployerCostPage} />
      <Route path="/hr/payroll-engine" component={PayrollEnginePage} />
      <Route path="/hr/labor-cost-allocation" component={LaborCostAllocationPage} />
      <Route path="/hr/open-positions" component={OpenPositionsPage} />
      <Route path="/hr/candidates" component={CandidatesPage} />
      <Route path="/hr/interviews" component={InterviewsPage} />
      <Route path="/hr/contractor-contracts" component={HRContractorContractsPage} />
      <Route path="/hr/contractor-insurance" component={HRContractorInsurancePage} />
      <Route path="/hr/contractor-payments" component={HRContractorPaymentsPage} />
      <Route path="/hr/employee-card/:id" component={EmployeeCardPage} />
      <Route path="/hr/employee-card" component={EmployeeCardPage} />
      <Route path="/hr/employee-goals" component={EmployeeGoalsPage} />
      <Route path="/hr/employment-history" component={EmploymentHistoryPage} />
      <Route path="/hr/health-safety" component={HealthSafetyPage} />
      <Route path="/hr/expense-claims" component={HRExpenseClaimsPage} />
      <Route path="/workforce-analysis" component={WorkforceAnalysisPage} />
    </>
);
