import { NavLink } from 'react-router-dom';

const navItems = [
  { path: '/', label: 'דשבורד', icon: '📊' },
  { path: '/invoices', label: 'חשבוניות', icon: '🧾' },
  { path: '/suppliers', label: 'ספקים', icon: '🏢' },
  { path: '/payments', label: 'תשלומים', icon: '💳' },
  { path: '/approvals', label: 'אישורים', icon: '✅' },
  { path: '/categories', label: 'קטגוריות', icon: '🏷️' },
  { path: '/reports', label: 'דוחות', icon: '📈' },
  { path: '/settings', label: 'הגדרות', icon: '⚙️' },
];

export default function Sidebar({ open, onClose }) {
  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden" onClick={onClose} />
      )}

      <aside className={`
        fixed lg:static inset-y-0 right-0 z-50
        w-64 bg-white border-l border-gray-200 shadow-lg lg:shadow-none
        transform transition-transform duration-300 ease-in-out
        ${open ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="h-16 flex items-center justify-center border-b border-gray-200 bg-primary-600">
          <h1 className="text-xl font-bold text-white">מנהל חשבוניות</h1>
        </div>

        {/* Navigation */}
        <nav className="mt-4 px-3">
          {navItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              onClick={onClose}
              className={({ isActive }) => `
                flex items-center gap-3 px-4 py-3 mb-1 rounded-lg text-sm font-medium
                transition-colors duration-150
                ${isActive
                  ? 'bg-primary-50 text-primary-700 border-r-4 border-primary-600'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }
              `}
            >
              <span className="text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200">
          <div className="text-xs text-gray-400 text-center">
            Invoice Manager v2.0
          </div>
        </div>
      </aside>
    </>
  );
}
