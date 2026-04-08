import { describe, it, expect } from "vitest";
import {
  checkModuleAccess,
  checkEntityAccess,
  getFieldPermission,
  checkActionAccess,
  checkModuleCrud,
  checkBuilderAccess,
  filterFieldsForRead,
  getReadOnlyFields,
  validateWriteFields,
  buildScopeConditions,
} from "../../lib/permission-engine";
import type { ResolvedPermissions, DataScopeRule } from "../../lib/permission-engine";

const superAdminPerms: ResolvedPermissions = {
  isSuperAdmin: true,
  builderAccess: true,
  roles: ["superAdmin"],
  roleIds: [],
  department: "IT",
  modules: {},
  entities: {},
  fields: {},
  actions: {},
};

const noPerms: ResolvedPermissions = {
  isSuperAdmin: false,
  builderAccess: false,
  roles: [],
  roleIds: [],
  department: null,
  modules: {},
  entities: {},
  fields: {},
  actions: {},
};

const limitedPerms: ResolvedPermissions = {
  isSuperAdmin: false,
  builderAccess: false,
  roles: ["viewer"],
  roleIds: [1],
  department: "Sales",
  modules: {
    "1": { view: true, manage: false },
    "2": { view: false, manage: true },
  },
  entities: {
    "10": { create: false, read: true, update: false, delete: false },
    "11": { create: true, read: true, update: true, delete: false },
  },
  fields: {
    "10": { salary: "hidden", name: "read", phone: "write" },
  },
  actions: {
    "export": { execute: true },
    "delete_all": { execute: false },
  },
};

describe("Permission Engine - Unit Tests", () => {
  describe("checkModuleAccess", () => {
    it("superAdmin always has access", () => {
      expect(checkModuleAccess(superAdminPerms, 999, "view")).toBe(true);
      expect(checkModuleAccess(superAdminPerms, 999, "manage")).toBe(true);
    });

    it("no access for unknown module", () => {
      expect(checkModuleAccess(noPerms, 999, "view")).toBe(false);
    });

    it("view access when view is true", () => {
      expect(checkModuleAccess(limitedPerms, 1, "view")).toBe(true);
    });

    it("no manage access when only view is true", () => {
      expect(checkModuleAccess(limitedPerms, 1, "manage")).toBe(false);
    });

    it("view access granted when manage is true (manage implies view)", () => {
      expect(checkModuleAccess(limitedPerms, 2, "view")).toBe(true);
    });

    it("manage access when manage is true", () => {
      expect(checkModuleAccess(limitedPerms, 2, "manage")).toBe(true);
    });

    it("no access for module not in permissions", () => {
      expect(checkModuleAccess(limitedPerms, 999, "view")).toBe(false);
    });

    it("works with string module ID", () => {
      expect(checkModuleAccess(limitedPerms, "1", "view")).toBe(true);
    });
  });

  describe("checkEntityAccess", () => {
    it("superAdmin always has access to any action", () => {
      expect(checkEntityAccess(superAdminPerms, 999, "create")).toBe(true);
      expect(checkEntityAccess(superAdminPerms, 999, "delete")).toBe(true);
    });

    it("read access when only read is true", () => {
      expect(checkEntityAccess(limitedPerms, 10, "read")).toBe(true);
    });

    it("no create when create is false", () => {
      expect(checkEntityAccess(limitedPerms, 10, "create")).toBe(false);
    });

    it("no delete when delete is false", () => {
      expect(checkEntityAccess(limitedPerms, 11, "delete")).toBe(false);
    });

    it("no access for unknown entity", () => {
      expect(checkEntityAccess(noPerms, 999, "read")).toBe(false);
    });
  });

  describe("getFieldPermission", () => {
    it("superAdmin always gets write", () => {
      expect(getFieldPermission(superAdminPerms, 10, "salary")).toBe("write");
    });

    it("returns hidden for hidden field", () => {
      expect(getFieldPermission(limitedPerms, 10, "salary")).toBe("hidden");
    });

    it("returns read for read-only field", () => {
      expect(getFieldPermission(limitedPerms, 10, "name")).toBe("read");
    });

    it("returns write for writable field", () => {
      expect(getFieldPermission(limitedPerms, 10, "phone")).toBe("write");
    });

    it("returns write for unknown field (default)", () => {
      expect(getFieldPermission(limitedPerms, 10, "unknown_field")).toBe("write");
    });

    it("returns write for entity with no field config", () => {
      expect(getFieldPermission(limitedPerms, 11, "any_field")).toBe("write");
    });
  });

  describe("checkActionAccess", () => {
    it("superAdmin has all action access", () => {
      expect(checkActionAccess(superAdminPerms, "any_action")).toBe(true);
    });

    it("executes when action execute is true", () => {
      expect(checkActionAccess(limitedPerms, "export")).toBe(true);
    });

    it("denies when action execute is false", () => {
      expect(checkActionAccess(limitedPerms, "delete_all")).toBe(false);
    });

    it("denies unknown actions", () => {
      expect(checkActionAccess(limitedPerms, "unknown")).toBe(false);
    });
  });

  describe("checkModuleCrud", () => {
    it("superAdmin has all CRUD", () => {
      expect(checkModuleCrud(superAdminPerms, 1, "create")).toBe(true);
      expect(checkModuleCrud(superAdminPerms, 1, "edit")).toBe(true);
      expect(checkModuleCrud(superAdminPerms, 1, "delete")).toBe(true);
    });

    it("manage permission grants all crud", () => {
      expect(checkModuleCrud(limitedPerms, 2, "create")).toBe(true);
      expect(checkModuleCrud(limitedPerms, 2, "edit")).toBe(true);
      expect(checkModuleCrud(limitedPerms, 2, "delete")).toBe(true);
    });

    it("view-only has no crud", () => {
      expect(checkModuleCrud(limitedPerms, 1, "create")).toBe(false);
    });
  });

  describe("checkBuilderAccess", () => {
    it("superAdmin has builder access", () => {
      expect(checkBuilderAccess(superAdminPerms)).toBe(true);
    });

    it("no builder access for regular user", () => {
      expect(checkBuilderAccess(noPerms)).toBe(false);
    });

    it("user with builderAccess=true has access", () => {
      const builderPerms = { ...noPerms, builderAccess: true };
      expect(checkBuilderAccess(builderPerms)).toBe(true);
    });
  });

  describe("filterFieldsForRead", () => {
    const data = { name: "John", salary: 10000, phone: "050-123" };

    it("superAdmin sees all fields", () => {
      const result = filterFieldsForRead(superAdminPerms, 10, data);
      expect(result).toEqual(data);
    });

    it("hidden fields are removed from output", () => {
      const result = filterFieldsForRead(limitedPerms, 10, data);
      expect(result).not.toHaveProperty("salary");
    });

    it("read and write fields are included", () => {
      const result = filterFieldsForRead(limitedPerms, 10, data);
      expect(result).toHaveProperty("name");
      expect(result).toHaveProperty("phone");
    });

    it("entity with no field config returns all data", () => {
      const result = filterFieldsForRead(limitedPerms, 99, data);
      expect(result).toEqual(data);
    });
  });

  describe("getReadOnlyFields", () => {
    it("superAdmin has no read-only fields", () => {
      expect(getReadOnlyFields(superAdminPerms, 10)).toEqual([]);
    });

    it("returns read-only field slugs", () => {
      const result = getReadOnlyFields(limitedPerms, 10);
      expect(result).toContain("name");
      expect(result).not.toContain("salary");
      expect(result).not.toContain("phone");
    });
  });

  describe("validateWriteFields", () => {
    it("superAdmin has no write violations", () => {
      expect(validateWriteFields(superAdminPerms, 10, { salary: 50000 })).toEqual([]);
    });

    it("writing to hidden field is a violation", () => {
      const violations = validateWriteFields(limitedPerms, 10, { salary: 50000 });
      expect(violations).toContain("salary");
    });

    it("writing to read-only field is a violation", () => {
      const violations = validateWriteFields(limitedPerms, 10, { name: "Jane" });
      expect(violations).toContain("name");
    });

    it("writing to writable field is not a violation", () => {
      const violations = validateWriteFields(limitedPerms, 10, { phone: "055-999" });
      expect(violations).not.toContain("phone");
    });
  });

  describe("buildScopeConditions", () => {
    it("returns denyAll=true for empty rules", () => {
      const result = buildScopeConditions([], "1");
      expect(result.denyAll).toBe(true);
    });

    it("all scope allows everything without conditions", () => {
      const rules: DataScopeRule[] = [{
        id: 1, roleId: 1, entityId: 1,
        scopeType: "all", field: null, operator: null,
        value: null, description: null, isActive: true,
      }];
      const result = buildScopeConditions(rules, "1");
      expect(result.denyAll).toBe(false);
      expect(result.conditions).toHaveLength(0);
    });

    it("own scope adds condition for created_by/assigned_to", () => {
      const rules: DataScopeRule[] = [{
        id: 1, roleId: 1, entityId: 1,
        scopeType: "own", field: null, operator: null,
        value: null, description: null, isActive: true,
      }];
      const result = buildScopeConditions(rules, "42");
      expect(result.denyAll).toBe(false);
      expect(result.conditions).toHaveLength(1);
    });

    it("assigned_to_me scope adds condition", () => {
      const rules: DataScopeRule[] = [{
        id: 1, roleId: 1, entityId: 1,
        scopeType: "assigned_to_me", field: null, operator: null,
        value: null, description: null, isActive: true,
      }];
      const result = buildScopeConditions(rules, "5");
      expect(result.denyAll).toBe(false);
      expect(result.conditions.length).toBeGreaterThan(0);
    });

    it("created_by_me scope adds condition", () => {
      const rules: DataScopeRule[] = [{
        id: 1, roleId: 1, entityId: 1,
        scopeType: "created_by_me", field: null, operator: null,
        value: null, description: null, isActive: true,
      }];
      const result = buildScopeConditions(rules, "7");
      expect(result.denyAll).toBe(false);
      expect(result.conditions.length).toBeGreaterThan(0);
    });
  });
});
