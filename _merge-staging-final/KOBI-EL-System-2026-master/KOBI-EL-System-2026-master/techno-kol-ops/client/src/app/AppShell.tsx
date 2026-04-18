import React, { useEffect, useState } from "react";
import { Outlet, Navigate } from "react-router-dom";
import { Sidebar } from "../components/layout/Sidebar";
import { Topbar } from "../components/layout/Topbar";
import { useAuth } from "../hooks/useAuth";
import { fetchMenu, type MenuItem } from "../services/menuService";

export const AppShell: React.FC = () => {
  const { user } = useAuth();

  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadMenu = async () => {
      setLoading(true);
      try {
        const data = await fetchMenu();
        if (!cancelled) setMenu(data);
      } catch (err) {
        console.error("Menu load error", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadMenu();
    return () => { cancelled = true; };
  }, []);

  // Redirect to login — using Navigate component, not navigate() in render
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="w-full h-screen flex bg-[#0b0f17] text-white" dir="rtl">
      <Sidebar menu={menu} loading={loading} />
      <div className="flex flex-col flex-1 min-w-0">
        <Topbar />
        <main className="flex-1 overflow-auto p-4" role="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
