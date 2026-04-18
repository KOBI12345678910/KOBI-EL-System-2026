'use strict';

/**
 * Pre-built StateMachine instances for ALL core Techno-Kol Uzi ERP workflows.
 *
 * These machines mirror the canonical definitions in
 * onyx-procurement/src/pipeline/state-machines.js but are expressed as
 * StateMachine class instances from transition-engine.js so they can be
 * imported by any service and validated programmatically.
 *
 * 12 machines covering the full Master Flow:
 *   Lead -> Quote -> RFQ -> PO -> Project -> WorkOrder -> Invoice ->
 *   Payment -> Payroll -> Attendance -> Task -> Alert
 */

const { StateMachine } = require('./transition-engine');

// =================================================================
// 1. LEAD MACHINE
//    New -> Contacted -> Qualified -> Quoted -> Won -> Converted
//    Lost from any non-final state
// =================================================================

const leadMachine = new StateMachine({
  name: 'Lead',
  states: ['New', 'Contacted', 'Qualified', 'Quoted', 'Won', 'Converted', 'Lost'],
  transitions: {
    contact:  { from: ['New'],                              to: 'Contacted' },
    qualify:  { from: ['New', 'Contacted'],                 to: 'Qualified' },
    quote:    { from: ['Qualified'],                        to: 'Quoted' },
    win:      { from: ['Quoted'],                           to: 'Won' },
    convert:  { from: ['Won'],                              to: 'Converted' },
    lose:     { from: ['New', 'Contacted', 'Qualified', 'Quoted'], to: 'Lost' },
  },
});

// =================================================================
// 2. QUOTE MACHINE
//    Draft -> Sent -> UnderReview -> Approved / Rejected
//    Approved -> ConvertedToProject
//    Rejected -> Draft (revision cycle)
// =================================================================

const quoteMachine = new StateMachine({
  name: 'Quote',
  states: ['Draft', 'Sent', 'UnderReview', 'Approved', 'Rejected', 'ConvertedToProject'],
  transitions: {
    send:                { from: ['Draft'],                   to: 'Sent' },
    review:              { from: ['Sent'],                    to: 'UnderReview' },
    approve:             { from: ['Sent', 'UnderReview'],     to: 'Approved' },
    reject:              { from: ['Sent', 'UnderReview'],     to: 'Rejected' },
    revise:              { from: ['Rejected'],                to: 'Draft' },
    convert_to_project:  { from: ['Approved'],                to: 'ConvertedToProject' },
  },
});

// =================================================================
// 3. RFQ MACHINE
//    Draft -> Sent -> QuotesReceived -> UnderComparison -> Approved / Rejected
//    Approved -> ConvertedToPO
// =================================================================

const rfqMachine = new StateMachine({
  name: 'RFQ',
  states: ['Draft', 'Sent', 'QuotesReceived', 'UnderComparison', 'Approved', 'Rejected', 'ConvertedToPO'],
  transitions: {
    send:             { from: ['Draft'],                          to: 'Sent' },
    receive_quotes:   { from: ['Sent'],                           to: 'QuotesReceived' },
    compare:          { from: ['QuotesReceived'],                 to: 'UnderComparison' },
    approve:          { from: ['UnderComparison'],                to: 'Approved' },
    reject:           { from: ['Sent', 'QuotesReceived', 'UnderComparison'], to: 'Rejected' },
    convert_to_po:    { from: ['Approved'],                       to: 'ConvertedToPO' },
  },
});

// =================================================================
// 4. PO (PURCHASE ORDER) MACHINE
//    Draft -> PendingApproval -> Approved -> SentToSupplier ->
//    PartiallyReceived -> FullyReceived -> Closed
//    Cancelled from Draft, PendingApproval, Approved, SentToSupplier
//    Rejected goes back to Draft
// =================================================================

const poMachine = new StateMachine({
  name: 'PurchaseOrder',
  states: [
    'Draft', 'PendingApproval', 'Approved', 'SentToSupplier',
    'PartiallyReceived', 'FullyReceived', 'Closed', 'Cancelled',
  ],
  transitions: {
    request_approval:   { from: ['Draft'],                                           to: 'PendingApproval' },
    approve:            { from: ['PendingApproval'],                                 to: 'Approved' },
    reject:             { from: ['PendingApproval'],                                 to: 'Draft' },
    send_to_supplier:   { from: ['Approved'],                                        to: 'SentToSupplier' },
    partial_receive:    { from: ['SentToSupplier', 'PartiallyReceived'],              to: 'PartiallyReceived' },
    full_receive:       { from: ['SentToSupplier', 'PartiallyReceived'],              to: 'FullyReceived' },
    close:              { from: ['FullyReceived'],                                    to: 'Closed' },
    cancel:             { from: ['Draft', 'PendingApproval', 'Approved', 'SentToSupplier'], to: 'Cancelled' },
  },
});

// =================================================================
// 5. PROJECT MACHINE
//    Draft -> Approved -> InPlanning -> InProcurement -> InExecution ->
//    InDelivery -> Completed -> Closed
//    Cancelled from Draft, Approved, InPlanning, InProcurement, InExecution
// =================================================================

const projectMachine = new StateMachine({
  name: 'Project',
  states: [
    'Draft', 'Approved', 'InPlanning', 'InProcurement', 'InExecution',
    'InDelivery', 'Completed', 'Closed', 'Cancelled',
  ],
  transitions: {
    approve:   { from: ['Draft'],                                              to: 'Approved' },
    plan:      { from: ['Approved'],                                           to: 'InPlanning' },
    procure:   { from: ['Approved', 'InPlanning'],                             to: 'InProcurement' },
    execute:   { from: ['InPlanning', 'InProcurement'],                        to: 'InExecution' },
    deliver:   { from: ['InExecution'],                                        to: 'InDelivery' },
    complete:  { from: ['InExecution', 'InDelivery'],                          to: 'Completed' },
    close:     { from: ['Completed'],                                          to: 'Closed' },
    cancel:    { from: ['Draft', 'Approved', 'InPlanning', 'InProcurement', 'InExecution'], to: 'Cancelled' },
  },
});

// =================================================================
// 6. WORK ORDER MACHINE
//    Open -> Assigned -> WaitingMaterials -> InProgress -> QA ->
//    Completed -> SignedOff
//    Cancelled from Open, Assigned, WaitingMaterials, InProgress
// =================================================================

const workOrderMachine = new StateMachine({
  name: 'WorkOrder',
  states: [
    'Open', 'Assigned', 'WaitingMaterials', 'InProgress',
    'QA', 'Completed', 'SignedOff', 'Cancelled',
  ],
  transitions: {
    assign:            { from: ['Open'],                                        to: 'Assigned' },
    wait_materials:    { from: ['Assigned'],                                    to: 'WaitingMaterials' },
    start:             { from: ['Assigned', 'WaitingMaterials'],                to: 'InProgress' },
    send_to_qa:        { from: ['InProgress'],                                  to: 'QA' },
    fail_qa:           { from: ['QA'],                                          to: 'InProgress' },
    complete:          { from: ['InProgress', 'QA'],                            to: 'Completed' },
    signoff:           { from: ['Completed'],                                   to: 'SignedOff' },
    cancel:            { from: ['Open', 'Assigned', 'WaitingMaterials', 'InProgress'], to: 'Cancelled' },
  },
});

// =================================================================
// 7. INVOICE MACHINE
//    Draft -> Issued -> PartiallyPaid -> Paid
//    Issued -> Overdue (time-triggered)
//    Overdue -> PartiallyPaid / Paid
//    Cancelled from Draft, Issued
// =================================================================

const invoiceMachine = new StateMachine({
  name: 'Invoice',
  states: ['Draft', 'Issued', 'Sent', 'PartiallyPaid', 'Paid', 'Overdue', 'InCollection', 'Cancelled'],
  transitions: {
    issue:        { from: ['Draft'],                               to: 'Issued' },
    send:         { from: ['Issued'],                              to: 'Sent' },
    partial_pay:  { from: ['Sent', 'Overdue'],                     to: 'PartiallyPaid' },
    full_pay:     { from: ['Sent', 'PartiallyPaid', 'Overdue', 'InCollection'], to: 'Paid' },
    mark_overdue: { from: ['Sent', 'PartiallyPaid'],               to: 'Overdue' },
    collect:      { from: ['Overdue'],                             to: 'InCollection' },
    cancel:       { from: ['Draft', 'Issued'],                     to: 'Cancelled' },
  },
});

// =================================================================
// 8. PAYMENT MACHINE
//    Draft -> Posted -> Reconciled
//    Reversed from Draft, Posted
// =================================================================

const paymentMachine = new StateMachine({
  name: 'Payment',
  states: ['Draft', 'Posted', 'Reconciled', 'Reversed'],
  transitions: {
    post:       { from: ['Draft'],           to: 'Posted' },
    reconcile:  { from: ['Posted'],          to: 'Reconciled' },
    reverse:    { from: ['Draft', 'Posted'], to: 'Reversed' },
  },
});

// =================================================================
// 9. PAYROLL MACHINE
//    Draft -> Calculated -> Approved -> Exported -> Paid
//    Recalculate sends Calculated back to Draft
//    Cancelled from Draft, Calculated
// =================================================================

const payrollMachine = new StateMachine({
  name: 'Payroll',
  states: ['Draft', 'Calculated', 'Approved', 'Exported', 'Paid', 'Cancelled'],
  transitions: {
    calculate:    { from: ['Draft'],           to: 'Calculated' },
    recalculate:  { from: ['Calculated'],      to: 'Draft' },
    approve:      { from: ['Calculated'],      to: 'Approved' },
    export:       { from: ['Approved'],        to: 'Exported' },
    pay:          { from: ['Approved', 'Exported'], to: 'Paid' },
    cancel:       { from: ['Draft', 'Calculated'], to: 'Cancelled' },
  },
});

// =================================================================
// 10. ATTENDANCE MACHINE
//     Draft -> Submitted -> Approved / Rejected
//     Rejected -> Draft (revision cycle)
//     Approved -> ExportedToPayroll
// =================================================================

const attendanceMachine = new StateMachine({
  name: 'Attendance',
  states: ['Draft', 'Submitted', 'Approved', 'Rejected', 'ExportedToPayroll'],
  transitions: {
    submit:             { from: ['Draft'],      to: 'Submitted' },
    approve:            { from: ['Submitted'],  to: 'Approved' },
    reject:             { from: ['Submitted'],  to: 'Rejected' },
    revise:             { from: ['Rejected'],   to: 'Draft' },
    export_to_payroll:  { from: ['Approved'],   to: 'ExportedToPayroll' },
  },
});

// =================================================================
// 11. TASK MACHINE
//     Open -> Assigned -> InProgress -> Completed
//     Cancelled from Open, Assigned, InProgress
//     Blocked from InProgress, Unblocked back to InProgress
// =================================================================

const taskMachine = new StateMachine({
  name: 'Task',
  states: ['Open', 'Assigned', 'InProgress', 'Blocked', 'Completed', 'Cancelled'],
  transitions: {
    assign:    { from: ['Open'],                       to: 'Assigned' },
    start:     { from: ['Assigned'],                   to: 'InProgress' },
    block:     { from: ['InProgress'],                 to: 'Blocked' },
    unblock:   { from: ['Blocked'],                    to: 'InProgress' },
    complete:  { from: ['InProgress'],                 to: 'Completed' },
    cancel:    { from: ['Open', 'Assigned', 'InProgress'], to: 'Cancelled' },
  },
});

// =================================================================
// 12. ALERT MACHINE
//     New -> Acknowledged -> InProgress -> Resolved
//     Reopened from Resolved back to InProgress
//     Dismissed from New, Acknowledged
// =================================================================

const alertMachine = new StateMachine({
  name: 'Alert',
  states: ['New', 'Acknowledged', 'InProgress', 'Resolved', 'Dismissed'],
  transitions: {
    acknowledge: { from: ['New'],                    to: 'Acknowledged' },
    start:       { from: ['Acknowledged'],           to: 'InProgress' },
    resolve:     { from: ['InProgress'],             to: 'Resolved' },
    reopen:      { from: ['Resolved'],               to: 'InProgress' },
    dismiss:     { from: ['New', 'Acknowledged'],    to: 'Dismissed' },
  },
});

// =================================================================
// Lookup map -- resolve machine by entity type string
// =================================================================

/**
 * Map of entity type key -> StateMachine instance.
 * Keys match the canonical entity type names used across the ERP.
 *
 * @type {Record<string, StateMachine>}
 */
const MACHINES = {
  lead:          leadMachine,
  quote:         quoteMachine,
  rfq:           rfqMachine,
  purchase_order: poMachine,
  po:            poMachine,          // alias
  project:       projectMachine,
  work_order:    workOrderMachine,
  invoice:       invoiceMachine,
  payment:       paymentMachine,
  payroll:       payrollMachine,
  attendance:    attendanceMachine,
  task:          taskMachine,
  alert:         alertMachine,
};

/**
 * Get a StateMachine instance by entity type string.
 *
 * @param {string} entityType - Entity type key (e.g. 'purchase_order', 'lead')
 * @returns {StateMachine|null}
 */
function getMachine(entityType) {
  return MACHINES[entityType] || null;
}

module.exports = {
  // Individual machines
  leadMachine,
  quoteMachine,
  rfqMachine,
  poMachine,
  projectMachine,
  workOrderMachine,
  invoiceMachine,
  paymentMachine,
  payrollMachine,
  attendanceMachine,
  taskMachine,
  alertMachine,

  // Lookup
  MACHINES,
  getMachine,
};
