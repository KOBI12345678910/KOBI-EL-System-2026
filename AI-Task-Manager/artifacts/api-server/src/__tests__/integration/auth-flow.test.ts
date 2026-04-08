import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseCompanyRolesSettings } from "../../lib/auth";

vi.mock("../../lib/gmail-service", () => ({
  sendWelcomeEmail: vi.fn().mockResolvedValue({ success: true }),
  sendPasswordResetEmail: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("../../lib/db-health", () => ({
  isDbAlive: vi.fn().mockResolvedValue(false),
  setDbAlive: vi.fn(),
}));

vi.mock("@workspace/db", async (importOriginal) => {
  const usersStore = new Map<string, any>();
  const sessionsStore = new Map<string, any>();
  let userIdCounter = 100;

  const mockDb = {
    select: vi.fn().mockImplementation(() => {
      return {
        from: vi.fn().mockImplementation((table: any) => ({
          where: vi.fn().mockImplementation((_cond: any) => ({
            limit: vi.fn().mockResolvedValue([]),
            orderBy: vi.fn().mockResolvedValue([]),
          })),
          orderBy: vi.fn().mockResolvedValue([]),
          limit: vi.fn().mockResolvedValue([]),
        })),
      };
    }),
    insert: vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation((vals: any) => ({
        returning: vi.fn().mockResolvedValue([{ id: ++userIdCounter, ...vals }]),
      })),
    })),
    update: vi.fn().mockImplementation(() => ({
      set: vi.fn().mockImplementation(() => ({
        where: vi.fn().mockResolvedValue([]),
        returning: vi.fn().mockResolvedValue([]),
      })),
    })),
    delete: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  };

  return {
    db: mockDb,
    pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
    withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
  };
});

import crypto from "crypto";
import { loginUser, validateSession, logoutUser } from "../../lib/auth";

describe("Auth Flow - Integration Tests", () => {
  describe("Fallback authentication (DB unavailable)", () => {
    it("rejects login with wrong username", async () => {
      const result = await loginUser("nonexistent", "wrongpassword");
      expect(result.error).toBeDefined();
      expect(result.token).toBeUndefined();
    });

    it("rejects login with wrong password for fallback user", async () => {
      const result = await loginUser("admin", "wrongpassword");
      expect(result.error).toBeDefined();
      expect(result.token).toBeUndefined();
    });

    it("authenticates fallback admin user with correct credentials", async () => {
      const result = await loginUser("admin", "admin123");
      expect(result.error).toBeUndefined();
      expect(result.token).toBeDefined();
      expect(result.user).toBeDefined();
      expect((result.user as any)?.username).toBe("admin");
    });

    it("token is 96 hex chars (48 bytes)", async () => {
      const result = await loginUser("admin", "admin123");
      expect(result.token?.length).toBe(96);
    });

    it("returned user does not contain passwordHash", async () => {
      const result = await loginUser("admin", "admin123");
      expect(result.user).not.toHaveProperty("passwordHash");
    });

    it("fallback user is marked as superAdmin", async () => {
      const result = await loginUser("admin", "admin123");
      expect((result.user as any)?.isSuperAdmin).toBe(true);
    });
  });

  describe("Session validation with fallback sessions", () => {
    let sessionToken: string;

    beforeEach(async () => {
      const loginResult = await loginUser("admin", "admin123");
      sessionToken = loginResult.token!;
    });

    it("validates an active session token", async () => {
      const result = await validateSession(sessionToken);
      expect(result.error).toBeUndefined();
      expect(result.user).toBeDefined();
    });

    it("session contains correct user data", async () => {
      const result = await validateSession(sessionToken);
      expect((result.user as any)?.username).toBe("admin");
    });

    it("invalid token returns error", async () => {
      const result = await validateSession("invalid_token_xyz_123");
      expect(result.error).toBeDefined();
    });

    it("empty token returns error", async () => {
      const result = await validateSession("");
      expect(result.error).toBeDefined();
    });

    it("random unknown token returns error", async () => {
      const token = crypto.randomBytes(48).toString("hex");
      const result = await validateSession(token);
      expect(result.error).toBeDefined();
    });
  });

  describe("Logout flow", () => {
    it("logout invalidates the session", async () => {
      const loginResult = await loginUser("admin", "admin123");
      const token = loginResult.token!;

      const beforeLogout = await validateSession(token);
      expect(beforeLogout.user).toBeDefined();

      await logoutUser(token);

      const afterLogout = await validateSession(token);
      expect(afterLogout.error).toBeDefined();
    });

    it("logout with invalid token does not throw", async () => {
      await expect(logoutUser("non_existent_token")).resolves.not.toThrow();
    });
  });

  describe("Multiple sessions", () => {
    it("two logins create two independent sessions", async () => {
      const result1 = await loginUser("admin", "admin123");
      const result2 = await loginUser("admin", "admin123");
      expect(result1.token).not.toBe(result2.token);
    });

    it("each session is independently valid", async () => {
      const result1 = await loginUser("admin", "admin123");
      const result2 = await loginUser("admin", "admin123");
      const session1 = await validateSession(result1.token!);
      const session2 = await validateSession(result2.token!);
      expect(session1.user).toBeDefined();
      expect(session2.user).toBeDefined();
    });

    it("logging out one session does not affect others", async () => {
      const result1 = await loginUser("admin", "admin123");
      const result2 = await loginUser("admin", "admin123");
      await logoutUser(result1.token!);
      const session2 = await validateSession(result2.token!);
      expect(session2.user).toBeDefined();
    });
  });
});
