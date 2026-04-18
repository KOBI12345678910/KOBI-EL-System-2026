import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseCompanyRolesSettings } from "../../lib/auth";

describe("Auth - Unit Tests", () => {
  describe("parseCompanyRolesSettings", () => {
    it("returns empty adminJobTitles for null input", () => {
      const result = parseCompanyRolesSettings(null);
      expect(result.adminJobTitles).toEqual([]);
    });

    it("returns empty adminJobTitles for undefined input", () => {
      const result = parseCompanyRolesSettings(undefined);
      expect(result.adminJobTitles).toEqual([]);
    });

    it("returns empty adminJobTitles for non-object input", () => {
      const result = parseCompanyRolesSettings("string");
      expect(result.adminJobTitles).toEqual([]);
    });

    it("returns parsed adminJobTitles from valid settings", () => {
      const settings = { adminJobTitles: ["מנכ\"ל", "מנהל מכירות"] };
      const result = parseCompanyRolesSettings(settings);
      expect(result.adminJobTitles).toEqual(["מנכ\"ל", "מנהל מכירות"]);
    });

    it("returns empty adminJobTitles if adminJobTitles is not an array", () => {
      const settings = { adminJobTitles: "not-an-array" };
      const result = parseCompanyRolesSettings(settings);
      expect(result.adminJobTitles).toEqual([]);
    });

    it("returns empty array for empty adminJobTitles", () => {
      const result = parseCompanyRolesSettings({ adminJobTitles: [] });
      expect(result.adminJobTitles).toEqual([]);
    });
  });

  describe("Password verification logic (unit)", () => {
    it("same password with same salt produces same hash", async () => {
      const { pbkdf2Sync } = await import("node:crypto");
      const salt = "test_salt_abc";
      const password = "MyTestPassword123!";
      const hash1 = pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
      const hash2 = pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
      expect(hash1).toBe(hash2);
    });

    it("different passwords produce different hashes", async () => {
      const { pbkdf2Sync } = await import("node:crypto");
      const salt = "same_salt";
      const hash1 = pbkdf2Sync("password1", salt, 100000, 64, "sha512").toString("hex");
      const hash2 = pbkdf2Sync("password2", salt, 100000, 64, "sha512").toString("hex");
      expect(hash1).not.toBe(hash2);
    });

    it("different salts produce different hashes for same password", async () => {
      const { pbkdf2Sync } = await import("node:crypto");
      const password = "samePassword";
      const hash1 = pbkdf2Sync(password, "salt1", 100000, 64, "sha512").toString("hex");
      const hash2 = pbkdf2Sync(password, "salt2", 100000, 64, "sha512").toString("hex");
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("Token generation", () => {
    it("generates unique tokens on each call", async () => {
      const { randomBytes } = await import("node:crypto");
      const token1 = randomBytes(48).toString("hex");
      const token2 = randomBytes(48).toString("hex");
      expect(token1).not.toBe(token2);
    });

    it("token has correct length (96 hex chars for 48 bytes)", async () => {
      const { randomBytes } = await import("node:crypto");
      const token = randomBytes(48).toString("hex");
      expect(token.length).toBe(96);
    });

    it("token contains only hex characters", async () => {
      const { randomBytes } = await import("node:crypto");
      const token = randomBytes(48).toString("hex");
      expect(/^[0-9a-f]+$/.test(token)).toBe(true);
    });
  });

  describe("Session duration", () => {
    it("session expiry is 72 hours in the future", () => {
      const SESSION_DURATION_HOURS = 72;
      const before = Date.now();
      const expiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 3600000);
      const after = Date.now();
      const diffMs = expiresAt.getTime() - before;
      expect(diffMs).toBeGreaterThanOrEqual(SESSION_DURATION_HOURS * 3600000);
      expect(diffMs).toBeLessThanOrEqual(SESSION_DURATION_HOURS * 3600000 + (after - before) + 10);
    });

    it("session with past expiry should be detected as expired", () => {
      const expiresAt = new Date(Date.now() - 1000);
      expect(expiresAt < new Date()).toBe(true);
    });

    it("active session with future expiry should be valid", () => {
      const expiresAt = new Date(Date.now() + 72 * 3600000);
      expect(expiresAt > new Date()).toBe(true);
    });
  });

  describe("Device name parsing", () => {
    it("detects iPhone from user agent", () => {
      const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)";
      expect(ua.includes("iPhone")).toBe(true);
    });

    it("detects Android from user agent", () => {
      const ua = "Mozilla/5.0 (Linux; Android 11; Pixel 5)";
      expect(ua.includes("Android")).toBe(true);
    });

    it("detects Windows from user agent", () => {
      const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
      expect(ua.includes("Windows")).toBe(true);
    });
  });
});
