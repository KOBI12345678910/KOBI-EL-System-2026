// ============================================================
// Workforce domain aggregator — mounted at /api/workforce
// Every sub-router installs authMiddleware + hrOrAdminMiddleware,
// with stricter role guards (hr_manager / finance_manager) on
// sensitive business endpoints (approve / pay / publish / export).
// ============================================================
import { Router } from "express";

import employeesRouter from "./employees";
import employeeProfilesRouter from "./employee-profiles";
import attendanceRouter from "./attendance";
import leaveRequestsRouter from "./leave-requests";
import leaveTypesRouter from "./leave-types";
import payrollRunsRouter from "./payroll-runs";
import payrollLineItemsRouter from "./payroll-line-items";
import payrollExceptionsRouter from "./payroll-exceptions";
import wageSlipsRouter from "./wage-slips";
import payComponentsRouter from "./pay-components";
import benefitsRouter from "./benefits";
import pensionRecordsRouter from "./pension-records";
import shiftsRouter from "./shifts";
import payrollExportBatchesRouter from "./payroll-export-batches";

const workforceRouter = Router();

workforceRouter.use("/employees", employeesRouter);
workforceRouter.use("/employee-profiles", employeeProfilesRouter);
workforceRouter.use("/attendance-logs", attendanceRouter);
workforceRouter.use("/leave-requests", leaveRequestsRouter);
workforceRouter.use("/leave-types", leaveTypesRouter);
workforceRouter.use("/payroll-runs", payrollRunsRouter);
workforceRouter.use("/payroll-line-items", payrollLineItemsRouter);
workforceRouter.use("/payroll-exceptions", payrollExceptionsRouter);
workforceRouter.use("/wage-slips", wageSlipsRouter);
workforceRouter.use("/pay-components", payComponentsRouter);
workforceRouter.use("/benefits", benefitsRouter);
workforceRouter.use("/pension-records", pensionRecordsRouter);
workforceRouter.use("/shifts", shiftsRouter);
workforceRouter.use("/payroll-export-batches", payrollExportBatchesRouter);

export default workforceRouter;
