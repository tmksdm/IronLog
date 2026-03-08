// src/components/layout/BottomNav.tsx

/**
 * Bottom navigation tab bar.
 * Shown on all pages except ActiveWorkoutPage.
 */

import { useLocation, useNavigate } from 'react-router-dom';
import { Home, ClipboardList, BarChart3, Settings } from 'lucide-react';

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  /** Match these paths to highlight this tab */
  matchPaths: string[];
}

const NAV_ITEMS: NavItem[] = [
  {
    path: '/',
    label: 'Главная',
    icon: <Home size={22} />,
    matchPaths: ['/'],
  },
  {
    path: '/history',
    label: 'История',
    icon: <ClipboardList size={22} />,
    matchPaths: ['/history', '/detail'],
  },
  {
    path: '/analytics',
    label: 'Аналитика',
    icon: <BarChart3 size={22} />,
    matchPaths: ['/analytics'],
  },
  {
    path: '/settings',
    label: 'Настройки',
    icon: <Settings size={22} />,
    matchPaths: ['/settings'],
  },
];

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (item: NavItem): boolean => {
    return item.matchPaths.some((p) => {
      if (p === '/') return location.pathname === '/';
      return location.pathname.startsWith(p);
    });
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-[#1E1E1E] border-t border-[#333333]">
      <div className="mx-auto max-w-[480px] flex items-stretch">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item);
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`
                flex-1 flex flex-col items-center justify-center gap-0.5 py-2 pt-2.5
                transition-colors select-none
                ${active
                  ? 'text-[#4CAF50]'
                  : 'text-[#707070] active:text-[#B0B0B0]'
                }
              `}
            >
              {item.icon}
              <span className="text-[10px] font-medium leading-tight">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
      {/* Safe area spacer for phones with gesture bar */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
