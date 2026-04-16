import { lazy } from "react";

const CRMControlRoom = lazy(() => import("../features/controlRooms/CRMControlRoom"));
const ServiceControlRoom = lazy(() => import("../features/controlRooms/ServiceControlRoom"));
const TreasuryControlRoom = lazy(() => import("../features/controlRooms/TreasuryControlRoom"));

export const extraControlRoomRoutes = [
  {
    key: "crm_control_room",
    path: "/crm-control",
    component: CRMControlRoom,
    requiredPermission: "customers.read",
    title: "CRM Control Room",
  },
  {
    key: "service_control_room",
    path: "/service-control",
    component: ServiceControlRoom,
    requiredPermission: "projects.read",
    title: "Service Control Room",
  },
  {
    key: "treasury_control_room",
    path: "/treasury-control",
    component: TreasuryControlRoom,
    requiredPermission: "finance.read",
    title: "Treasury Control Room",
  },
];
