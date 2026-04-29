import { NavLink, useNavigate } from 'react-router-dom';
import { clearToken } from '../../lib/api';
import { Button } from '../ui/button';
import { LayoutDashboard, FileText, Users, Megaphone, LogOut, Moon, Sun } from 'lucide-react';
import { useDarkMode } from '../../hooks/useDarkMode';

const links = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/residents', label: 'Residents', icon: Users },
  { to: '/announcements', label: 'Announcements', icon: Megaphone },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const [dark, setDark] = useDarkMode();

  const handleLogout = () => {
    clearToken();
    navigate('/login');
  };

  return (
    <div className="w-64 bg-gray-900 text-white flex flex-col h-screen sticky top-0">
      {/* Branding — fixed at top */}
      <div className="p-6 border-b border-gray-700 flex-shrink-0">
        <h1 className="text-lg font-bold">Barangay Admin</h1>
        <p className="text-gray-400 text-sm">Management Dashboard</p>
      </div>

      {/* Nav links — scrollable */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors text-sm font-medium ${
                isActive
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            <link.icon className="w-4 h-4" />
            {link.label}
          </NavLink>
        ))}
      </nav>

      {/* Toggle + Logout — fixed at bottom */}
      <div className="p-4 border-t border-gray-700 flex-shrink-0 space-y-2">
        <Button
          onClick={() => setDark(!dark)}
          variant="ghost"
          className="w-full text-gray-300 hover:text-white hover:bg-gray-800 justify-start gap-3"
        >
          {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          {dark ? 'Light Mode' : 'Dark Mode'}
        </Button>
        <Button
          onClick={handleLogout}
          variant="ghost"
          className="w-full text-gray-300 hover:text-white hover:bg-gray-800 justify-start gap-3"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </Button>
      </div>
    </div>
  );
}