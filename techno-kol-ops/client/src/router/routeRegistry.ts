import { lazy, ComponentType } from "react";

// ── Control Rooms (lazy-loaded) ────────────────────────────
const OperationsControlRoom = lazy(
  () => import("../features/controlRooms/OperationsControlRoom")
);
const ProcurementControlRoom = lazy(
  () => import("../features/controlRooms/ProcurementControlRoom")
);
const WorkforceControlRoom = lazy(
  () => import("../features/controlRooms/WorkforceControlRoom")
);
const ExecutiveControlTower = lazy(
  () => import("../features/controlRooms/ExecutiveControlTower")
);
const AIControlRoom = lazy(
  () => import("../features/controlRooms/AIControlRoom")
);
const CommandCenter = lazy(
  () => import("../features/controlRooms/CommandCenter")
);

// ── 360 Pages (lazy-loaded) ────────────────────────────────
const Customer360 = lazy(() => import("../features/customers/Customer360"));
const Project360 = lazy(() => import("../features/projects/Project360"));
const WorkOrder360 = lazy(() => import("../features/workOrders/WorkOrder360"));
const RFQ360 = lazy(() => import("../features/procurement/RFQ360"));
const PO360 = lazy(() => import("../features/procurement/PO360"));
const Employee360 = lazy(() => import("../features/workforce/Employee360"));
const Supplier360 = lazy(() => import("../features/procurement/Supplier360"));
const Quote360 = lazy(() => import("../features/quotes/Quote360"));
const Finance360 = lazy(() => import("../features/finance/Finance360"));

// ── Route record type ──────────────────────────────────────
export type AppRouteRecord = {
  key: string;
  path: string;
  component: ComponentType<any>;
  requiredPermission?: string;
  title: string;
};

// ── Full registry ──────────────────────────────────────────
export const appRouteRegistry: AppRouteRecord[] = [
  {
    key: "executive_control_tower",
    path: "/executive",
    component: ExecutiveControlTower,
    requiredPermission: "control_room.executive",
    title: "Executive Control Tower",
  },
  {
    key: "operations_control_room",
    path: "/operations",
    component: OperationsControlRoom,
    requiredPermission: "control_room.operations",
    title: "Operations Control Room",
  },
  {
    key: "procurement_control_room",
    path: "/procurement",
    component: ProcurementControlRoom,
    requiredPermission: "control_room.procurement",
    title: "Procurement Control Room",
  },
  {
    key: "workforce_control_room",
    path: "/workforce",
    component: WorkforceControlRoom,
    requiredPermission: "control_room.workforce",
    title: "Workforce Control Room",
  },
  {
    key: "finance_360",
    path: "/finance",
    component: Finance360,
    requiredPermission: "finance.read",
    title: "Finance 360",
  },
  {
    key: "customer_360",
    path: "/customer/:id",
    component: Customer360,
    requiredPermission: "customers.read",
    title: "Customer 360",
  },
  {
    key: "project_360",
    path: "/project/:id",
    component: Project360,
    requiredPermission: "projects.read",
    title: "Project 360",
  },
  {
    key: "workorder_360",
    path: "/work-order/:id",
    component: WorkOrder360,
    requiredPermission: "workorders.read",
    title: "Work Order 360",
  },
  {
    key: "rfq_360",
    path: "/rfq/:id",
    component: RFQ360,
    requiredPermission: "rfq.read",
    title: "RFQ 360",
  },
  {
    key: "po_360",
    path: "/po/:id",
    component: PO360,
    requiredPermission: "po.read",
    title: "PO 360",
  },
  {
    key: "employee_360",
    path: "/employee/:id",
    component: Employee360,
    requiredPermission: "employees.read",
    title: "Employee 360",
  },
  {
    key: "supplier_360",
    path: "/supplier/:id",
    component: Supplier360,
    requiredPermission: "suppliers.read",
    title: "Supplier 360",
  },
  {
    key: "quote_360",
    path: "/quote/:id",
    component: Quote360,
    requiredPermission: "quotes.read",
    title: "Quote 360",
  },
  {
    key: "ai_control_room",
    path: "/ai",
    component: AIControlRoom,
    requiredPermission: "control_room.executive",
    title: "AI Control Room",
  },
  {
    key: "command_center",
    path: "/command-center",
    component: CommandCenter,
    requiredPermission: "control_room.executive",
    title: "Command Center",
  },
];
