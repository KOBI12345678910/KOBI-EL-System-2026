import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import type { MenuItem } from "../../services/menuService";

interface SidebarProps {
  menu: MenuItem[];
  loading?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ menu, loading }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});

  const toggle = (id: number) =>
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));

  const renderItem = (item: MenuItem, depth = 0) => {
    const active = item.route ? location.pathname === item.route : false;
    const hasChildren = item.children && item.children.length > 0;
    const isOpen = !collapsed[item.id];

    return (
      <li key={item.id} role="none">
        <button
          role="menuitem"
          aria-current={active ? "page" : undefined}
          aria-expanded={hasChildren ? isOpen : undefined}
          onClick={() => {
            if (item.route) navigate(item.route);
            if (hasChildren) toggle(item.id);
          }}
          className={`w-full text-right flex items-center gap-2 px-3 py-2 rounded-lg mb-0.5 transition-colors text-sm
            ${active
              ? "bg-blue-600 text-white font-medium"
              : "text-gray-300 hover:bg-gray-700/60 hover:text-white"
            }
            ${depth > 0 ? "pr-" + (3 + depth * 3) : ""}
          `}
          style={depth > 0 ? { paddingRight: `${12 + depth * 12}px` } : undefined}
        >
          {item.icon && <span className="text-base shrink-0">{item.icon}</span>}
          <span className="truncate">{item.label}</span>
          {hasChildren && (
            <span
              className={`mr-auto text-xs transition-transform ${isOpen ? "rotate-90" : ""}`}
              aria-hidden="true"
            >
              ◀
            </span>
          )}
        </button>

        {hasChildren && isOpen && (
          <ul role="group" className="mt-0.5">
            {item.children.map((child) => renderItem(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <nav
      aria-label="תפריט ראשי"
      className="w-64 bg-[#111827] flex flex-col shrink-0 border-l border-gray-700/50"
    >
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-gray-700/50">
        <div className="w-2.5 h-2.5 bg-blue-500 rounded-sm ml-2" />
        <span className="text-base font-bold tracking-wider">TECHNO-KOL</span>
      </div>

      {/* Menu */}
      <div className="flex-1 overflow-auto p-3">
        {loading ? (
          <div className="text-center text-gray-500 text-xs mt-8">טוען תפריט...</div>
        ) : menu.length === 0 ? (
          <div className="text-center text-gray-500 text-xs mt-8">אין פריטי תפריט</div>
        ) : (
          <ul role="menubar" aria-label="ניווט ראשי">
            {menu.map((item) => renderItem(item))}
          </ul>
        )}
      </div>

      {/* Version badge */}
      <div className="px-4 py-2 border-t border-gray-700/50 text-[10px] text-gray-500">
        ERP 2026 v3.0
      </div>
    </nav>
  );
};
