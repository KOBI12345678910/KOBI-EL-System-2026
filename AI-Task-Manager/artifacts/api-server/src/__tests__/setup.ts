import { vi } from "vitest";

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    orderBy: vi.fn().mockReturnThis(),
    and: vi.fn().mockReturnThis(),
  },
  pool: {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  },
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../lib/gmail-service", () => ({
  sendWelcomeEmail: vi.fn().mockResolvedValue({ success: true }),
  sendPasswordResetEmail: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("../lib/db-health", () => ({
  isDbAlive: vi.fn().mockResolvedValue(true),
  setDbAlive: vi.fn(),
}));

vi.mock("../lib/metadata-cache", () => ({
  getEntityModuleMapping: vi.fn().mockResolvedValue(null),
  getRolePermissions: vi.fn().mockResolvedValue([]),
}));
