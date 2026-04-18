import { useEffect, useState } from "react";

export function usePermission() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authJson("/api/auth/me").then(setUser).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const can = {
    editLead: (lead) => {
      if (!user) return false;
      if (user.role === "admin") return true;
      if (user.role === "user" && lead.owner_id === user.id) return true;
      return false;
    },

    deleteLead: (lead) => {
      if (!user) return false;
      return user.role === "admin";
    },

    assignLead: () => {
      if (!user) return false;
      return user.role === "admin" || user.role === "manager";
    },

    viewLead: (lead) => {
      if (!user) return false;
      if (user.role === "admin") return true;
      if (lead.owner_id === user.id) return true;
      return false;
    },

    createTask: (lead) => {
      if (!user) return false;
      if (user.role === "admin") return true;
      if (lead.owner_id === user.id) return true;
      return false;
    },

    viewReport: (reportType) => {
      if (!user) return false;
      if (user.role === "admin") return true;
      if (reportType === "personal") return true;
      return false;
    },

    manageAutomations: () => {
      if (!user) return false;
      return user.role === "admin";
    },

    viewAnalytics: () => {
      if (!user) return false;
      return user.role === "admin" || user.role === "manager";
    },
  };

  return { can, user, loading };
}