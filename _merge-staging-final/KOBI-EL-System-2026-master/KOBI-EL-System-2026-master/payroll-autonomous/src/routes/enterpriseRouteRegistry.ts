import { lazy } from "react";

const MobileExecutiveShell = lazy(() => import("../features/mobile/MobileExecutiveShell"));
const AdvancedAIAgentConsole = lazy(() => import("../features/ai/AdvancedAIAgentConsole"));
const DocumentIntelligenceCenter = lazy(() => import("../features/documents/DocumentIntelligenceCenter"));
const NotificationCenter = lazy(() => import("../features/orchestration/NotificationCenter"));
const UniversalInbox = lazy(() => import("../features/orchestration/UniversalInbox"));
const FinanceControlRoom = lazy(() => import("../features/controlRooms/FinanceControlRoom"));
const FormulaBuilder = lazy(() => import("../features/intelligence/FormulaBuilder"));
const RouteMenuPermissionSyncConsole = lazy(() => import("../admin/RouteMenuPermissionSyncConsole"));

export const enterpriseRouteRegistry = [
  {
    key: "mobile_executive_shell",
    path: "/mobile-executive",
    component: MobileExecutiveShell,
    requiredPermission: "control_room.executive",
    title: "Mobile Executive Shell",
  },
  {
    key: "advanced_ai_agent_console",
    path: "/ai-agents",
    component: AdvancedAIAgentConsole,
    requiredPermission: "control_room.executive",
    title: "Advanced AI Agent Console",
  },
  {
    key: "document_intelligence_center",
    path: "/document-intelligence",
    component: DocumentIntelligenceCenter,
    requiredPermission: "control_room.executive",
    title: "Document Intelligence Center",
  },
  {
    key: "notification_center",
    path: "/notification-center",
    component: NotificationCenter,
    requiredPermission: "control_room.executive",
    title: "Notification Center",
  },
  {
    key: "universal_inbox",
    path: "/universal-inbox",
    component: UniversalInbox,
    requiredPermission: "control_room.executive",
    title: "Universal Inbox",
  },
  {
    key: "finance_control_room",
    path: "/finance",
    component: FinanceControlRoom,
    requiredPermission: "finance.read",
    title: "Finance Control Room",
  },
  {
    key: "formula_builder",
    path: "/formula-builder",
    component: FormulaBuilder,
    requiredPermission: "control_room.executive",
    title: "Formula Builder",
  },
  {
    key: "route_menu_permission_sync_console",
    path: "/admin/route-sync",
    component: RouteMenuPermissionSyncConsole,
    requiredPermission: "control_room.executive",
    title: "Route/Menu/Permission Sync",
  },
];
