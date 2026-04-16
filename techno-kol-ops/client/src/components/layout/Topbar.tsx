import React from "react";
import { useAuth } from "../../hooks/useAuth";

export const Topbar: React.FC = () => {
  const { user, logout } = useAuth();

  return (
    <header
      className="h-14 bg-[#1f2937] flex items-center justify-between px-4 border-b border-gray-700/50 shrink-0"
      role="banner"
    >
      <div className="font-semibold text-sm tracking-wide">
        מרכז בקרה — טכנו-קול עוזי
      </div>

      <div className="flex items-center gap-3">
        {user?.role && (
          <span className="text-[10px] px-2 py-0.5 rounded bg-blue-600/20 text-blue-300 uppercase tracking-wider">
            {user.role}
          </span>
        )}
        <span className="text-sm text-gray-300">{user?.email ?? user?.username}</span>
        <button
          onClick={logout}
          className="bg-red-600/80 hover:bg-red-600 px-3 py-1 rounded text-xs font-medium transition-colors"
          aria-label="יציאה מהמערכת"
        >
          יציאה
        </button>
      </div>
    </header>
  );
};
