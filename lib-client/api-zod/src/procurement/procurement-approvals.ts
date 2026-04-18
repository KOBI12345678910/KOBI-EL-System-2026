// Alias module — procurement_approvals === procurement.approvals
// Re-exports approval types under a distinct name space for registry clarity.
export {
  APPROVAL_STATES as PROCUREMENT_APPROVAL_STATES,
  ApprovalStateSchema as ProcurementApprovalStateSchema,
  CreateApprovalSchema as CreateProcurementApprovalSchema,
  UpdateApprovalSchema as UpdateProcurementApprovalSchema,
  DecideApprovalSchema as DecideProcurementApprovalSchema,
  ReadApprovalSchema as ReadProcurementApprovalSchema,
  ListApprovalsQuerySchema as ListProcurementApprovalsQuerySchema,
} from "./approvals";
export type {
  CreateApprovalInput as CreateProcurementApprovalInput,
  UpdateApprovalInput as UpdateProcurementApprovalInput,
  DecideApprovalInput as DecideProcurementApprovalInput,
  ReadApproval as ReadProcurementApproval,
  ListApprovalsQuery as ListProcurementApprovalsQuery,
} from "./approvals";
