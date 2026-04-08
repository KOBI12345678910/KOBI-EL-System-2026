import { Route, Redirect } from "wouter";
import { lazyPage } from "@/routes/lazy-utils";

const ProductionDashboardPage = lazyPage(() => import("@/pages/production/production-dashboard"));
const MESSystemPage = lazyPage(() => import("@/pages/production/mes-system"));
const SCADASystemPage = lazyPage(() => import("@/pages/production/scada-system"));
const ProductionKanbanPage = lazyPage(() => import("@/pages/production/production-kanban"));
const ProductionGanttPage = lazyPage(() => import("@/pages/production/production-gantt"));
const QualityControlPage = lazyPage(() => import("@/pages/modules/quality-control"));
const ProductionWorkOrdersPage = lazyPage(() => import("@/pages/production/production-work-orders"));
const CmmsDashboardPage = lazyPage(() => import("@/pages/production/cmms-dashboard"));
const BomManagerPage = lazyPage(() => import("@/pages/production/bom-manager"));
const QCInspectionsPage = lazyPage(() => import("@/pages/production/qc-inspections"));
const BomTreePage = lazyPage(() => import("@/pages/production/bom-tree"));
const WorkInstructionsEntPage = lazyPage(() => import("@/pages/production/work-instructions-ent"));
const ProductionPlanningPage = lazyPage(() => import("@/pages/production/production-planning"));
const QualityControlEntPage = lazyPage(() => import("@/pages/production/quality-control-ent"));
const MachineMaintenancePage = lazyPage(() => import("@/pages/production/machine-maintenance"));
const ProductionReportsPage = lazyPage(() => import("@/pages/production/production-reports"));
const ProductionLinesPage = lazyPage(() => import("@/pages/production/production-lines"));
const NCRReportsPage = lazyPage(() => import("@/pages/production/ncr-reports"));
const EquipmentManagementPage = lazyPage(() => import("@/pages/production/equipment-management"));
const InstallersPage = lazyPage(() => import("@/pages/production/installers"));
const InstallationsListPage = lazyPage(() => import("@/pages/production/installations-list"));
const QualityChecklistsPage = lazyPage(() => import("@/pages/production/quality-checklists"));
const CorrectiveActionsPage = lazyPage(() => import("@/pages/production/corrective-actions"));
const ProductDesignPage = lazyPage(() => import("@/pages/production/product-design"));
const ProductTestingPage = lazyPage(() => import("@/pages/production/product-testing"));
const PrototypesPage = lazyPage(() => import("@/pages/production/prototypes"));
const OutputReportPage = lazyPage(() => import("@/pages/production/output-report"));
const EfficiencyReportPage = lazyPage(() => import("@/pages/production/efficiency-report"));
const WasteReportPage = lazyPage(() => import("@/pages/production/waste-report"));
const CostReportPage = lazyPage(() => import("@/pages/production/cost-report"));
const BatchSerialTrackingPage = lazyPage(() => import("@/pages/production/batch-serial-tracking"));
const MrpPlanningPage = lazyPage(() => import("@/pages/production/mrp-planning"));
const ToolManagementPage = lazyPage(() => import("@/pages/production/tool-management"));
const FieldMeasurementsPage = lazyPage(() => import("@/pages/production/field-measurements-page"));
const ProductionSafetyPage = lazyPage(() => import("@/pages/production/safety-management"));
const OEEDashboardPage = lazyPage(() => import("@/pages/operations/oee-dashboard"));
const WorkOrdersPage = lazyPage(() => import("@/pages/modules/work-orders"));
const BomProductsPage = lazyPage(() => import("@/pages/bom-products"));
const DocumentControlPage = lazyPage(() => import("@/pages/modules/document-control"));

const FabProfilesPage = lazyPage(() => import("@/pages/fabrication/fab-profiles"));
const FabSystemsPage = lazyPage(() => import("@/pages/fabrication/fab-systems"));
const FabGlassCatalogPage = lazyPage(() => import("@/pages/fabrication/fab-glass-catalog"));
const FabAccessoriesPage = lazyPage(() => import("@/pages/fabrication/fab-accessories"));
const FabFinishesColorsPage = lazyPage(() => import("@/pages/fabrication/fab-finishes-colors"));
const FabCuttingListsPage = lazyPage(() => import("@/pages/fabrication/fab-cutting-lists"));
const FabAssemblyOrdersPage = lazyPage(() => import("@/pages/fabrication/fab-assembly-orders"));
const FabWeldingOrdersPage = lazyPage(() => import("@/pages/fabrication/fab-welding-orders"));
const FabGlazingOrdersPage = lazyPage(() => import("@/pages/fabrication/fab-glazing-orders"));
const FabCoatingOrdersPage = lazyPage(() => import("@/pages/fabrication/fab-coating-orders"));
const FabPackingListsPage = lazyPage(() => import("@/pages/fabrication/fab-packing-lists"));
const FabTransportOrdersPage = lazyPage(() => import("@/pages/fabrication/fab-transport-orders"));
const FabInstallationOrdersPage = lazyPage(() => import("@/pages/fabrication/fab-installation-orders"));
const FabServiceTicketsPage = lazyPage(() => import("@/pages/fabrication/fab-service-tickets"));
const FabWorkflowTrackerPage = lazyPage(() => import("@/pages/fabrication/fab-workflow-tracker"));

const CostPerUnitPage = lazyPage(() => import("@/pages/operations/cost-per-unit"));
const DowntimeTrackingPage = lazyPage(() => import("@/pages/operations/downtime-tracking"));
const ShiftHandoverPage = lazyPage(() => import("@/pages/operations/shift-handover"));

export const ProductionRoutes = (

    <>
      <Route path="/production" component={ProductionDashboardPage} />
      <Route path="/production/dashboard" component={ProductionDashboardPage} />
      <Route path="/production/mes" component={MESSystemPage} />
      <Route path="/production/scada" component={SCADASystemPage} />
      <Route path="/production/kanban" component={ProductionKanbanPage} />
      <Route path="/production/gantt" component={ProductionGanttPage} />
      <Route path="/production/quality-control" component={QualityControlPage} />
      <Route path="/production/work-orders" component={ProductionWorkOrdersPage} />
      <Route path="/production/maintenance" component={CmmsDashboardPage} />
      <Route path="/production/bom" component={BomManagerPage} />
      <Route path="/production/quality-inspections" component={QCInspectionsPage} />
      <Route path="/production/safety" component={ProductionSafetyPage} />
      <Route path="/production/bom-tree" component={BomTreePage} />
      <Route path="/production/production-planning" component={ProductionPlanningPage} />
      <Route path="/production/production-reports" component={ProductionReportsPage} />
      <Route path="/production/quality-control-ent" component={QualityControlEntPage} />
      <Route path="/production/work-instructions-ent" component={WorkInstructionsEntPage} />
      <Route path="/production/production-lines" component={ProductionLinesPage} />
      <Route path="/production/ncr-reports" component={NCRReportsPage} />
      <Route path="/production/equipment" component={EquipmentManagementPage} />
      <Route path="/production/installers" component={InstallersPage} />
      <Route path="/production/installations" component={InstallationsListPage} />
      <Route path="/production/quality-checklists" component={QualityChecklistsPage} />
      <Route path="/production/corrective-actions" component={CorrectiveActionsPage} />
      <Route path="/production/product-design" component={ProductDesignPage} />
      <Route path="/production/product-testing" component={ProductTestingPage} />
      <Route path="/production/prototypes" component={PrototypesPage} />
      <Route path="/production/output-report" component={OutputReportPage} />
      <Route path="/production/efficiency-report" component={EfficiencyReportPage} />
      <Route path="/production/waste-report" component={WasteReportPage} />
      <Route path="/production/cost-report" component={CostReportPage} />
      <Route path="/production/bom-manager" component={BomManagerPage} />
      <Route path="/production/work-orders-mgmt" component={ProductionWorkOrdersPage} />
      <Route path="/production/planning" component={ProductionPlanningPage} />
      <Route path="/production/qc-inspections" component={QCInspectionsPage} />
      <Route path="/production/machine-maintenance" component={MachineMaintenancePage} />
      <Route path="/production/cmms" component={CmmsDashboardPage} />
      <Route path="/production/reports" component={ProductionReportsPage} />
      <Route path="/production/batch-serial-tracking" component={BatchSerialTrackingPage} />
      <Route path="/production/mrp-planning" component={MrpPlanningPage} />
      <Route path="/production/tool-management" component={ToolManagementPage} />
      <Route path="/production/oee-dashboard" component={OEEDashboardPage} />
      <Route path="/manufacturing"><Redirect to="/production" /></Route>
      <Route path="/manufacturing/:rest*"><Redirect to="/production" /></Route>
      <Route path="/quality-control"><Redirect to="/production/quality-control" /></Route>
      <Route path="/production/field-measurements"><Redirect to="/installation/measurements" /></Route>
      <Route path="/production/installations-list"><Redirect to="/production/installations" /></Route>
      <Route path="/field-measurements" component={FieldMeasurementsPage} />
      <Route path="/installation/installers" component={InstallersPage} />
      <Route path="/installation/field" component={FieldMeasurementsPage} />
      <Route path="/installation/measurements" component={FieldMeasurementsPage} />
      <Route path="/document-control" component={DocumentControlPage} />
      <Route path="/work-orders"><Redirect to="/production/work-orders" /></Route>
      <Route path="/bom-products" component={BomProductsPage} />

      <Route path="/fabrication/profiles" component={FabProfilesPage} />
      <Route path="/fabrication/systems" component={FabSystemsPage} />
      <Route path="/fabrication/glass-catalog" component={FabGlassCatalogPage} />
      <Route path="/fabrication/accessories" component={FabAccessoriesPage} />
      <Route path="/fabrication/finishes-colors" component={FabFinishesColorsPage} />
      <Route path="/fabrication/cutting-lists" component={FabCuttingListsPage} />
      <Route path="/fabrication/assembly-orders" component={FabAssemblyOrdersPage} />
      <Route path="/fabrication/welding-orders" component={FabWeldingOrdersPage} />
      <Route path="/fabrication/glazing-orders" component={FabGlazingOrdersPage} />
      <Route path="/fabrication/coating-orders" component={FabCoatingOrdersPage} />
      <Route path="/fabrication/packing-lists" component={FabPackingListsPage} />
      <Route path="/fabrication/transport-orders" component={FabTransportOrdersPage} />
      <Route path="/fabrication/installation-orders" component={FabInstallationOrdersPage} />
      <Route path="/fabrication/service-tickets" component={FabServiceTicketsPage} />
      <Route path="/fabrication/workflow-tracker" component={FabWorkflowTrackerPage} />

      <Route path="/operations/cost-per-unit" component={CostPerUnitPage} />
      <Route path="/operations/downtime-tracking" component={DowntimeTrackingPage} />
      <Route path="/operations/shift-handover" component={ShiftHandoverPage} />
    </>
);
