import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LogIn, LogOut, Shield } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { PRIMARY_NAV_ITEMS } from '../../types/navigation';
import { AinemaxLogo } from '../brand/AinemaxLogo';
import { PWAInstallButton } from '../pwa/PWAInstallButton';
import { NavIcon } from './NavIcons';

export function LeftSidebar() {
  const navigate = useNavigate();
  const { firebaseUser, profile, isAdmin, logout } = useAuth();

  const primaryItems = PRIMARY_NAV_ITEMS.filter((i) => i.section === 'primary');
  const communityItems = PRIMARY_NAV_ITEMS.filter((i) => i.section === 'community');
  const accountItems = PRIMARY_NAV_ITEMS.filter((i) => i.section === 'account');

  const renderLink = (item: (typeof PRIMARY_NAV_ITEMS)[number]) => (
    <NavLink
      key={item.id}
      to={item.path}
      end={item.path === '/'}
      className={({ isActive }) =>
        `group flex items-center gap-3 px-3.5 py-2.5 min-h-[44px] rounded-xl text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
          isActive
            ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 font-semibold'
            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white'
        }`
      }
      title={item.label}
    >
      {({ isActive }) => (
        <>
          <NavIcon
            id={item.id}
            className={`w-5 h-5 shrink-0 transition-colors ${
              isActive
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-500 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-200'
            }`}
          />
          <span className="hidden lg:inline truncate">{item.label}</span>
        </>
      )}
    </NavLink>
  );

  return (
    <aside
      aria-label="Primary sidebar navigation"
      className="hidden md:flex flex-col justify-between sticky top-0 h-screen w-[76px] lg:w-[252px] shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 px-3 lg:px-4 py-4 overflow-y-auto transition-colors"
    >
      <div className="space-y-5">
        <div className="px-1.5 py-1 flex items-center justify-center lg:justify-start">
          <NavLink
            to="/"
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-lg"
            aria-label="AINEMAX Home"
          >
            <span className="lg:hidden">
              <AinemaxLogo showWordmark={false} size="md" />
            </span>
            <span className="hidden lg:inline-flex">
              <AinemaxLogo showWordmark size="md" />
            </span>
          </NavLink>
        </div>

        <nav className="space-y-1" aria-label="Core feeds">
          {primaryItems.map(renderLink)}
        </nav>

        <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-1">
          <div className="hidden lg:block px-3.5 pb-1 text-xs font-medium text-slate-400 dark:text-slate-500">
            Communities
          </div>
          {communityItems.map(renderLink)}
        </div>

        <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-1">
          <div className="hidden lg:block px-3.5 pb-1 text-xs font-medium text-slate-400 dark:text-slate-500">
            Personal
          </div>
          {accountItems.map(renderLink)}
          {isAdmin && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `group flex items-center gap-3 px-3.5 py-2.5 min-h-[44px] rounded-xl text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 font-semibold'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white'
                }`
              }
              title="Admin Portal"
            >
              {({ isActive }) => (
                <>
                  <Shield
                    className={`w-5 h-5 shrink-0 ${
                      isActive
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-slate-500 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-200'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="hidden lg:inline truncate">Admin Portal</span>
                </>
              )}
            </NavLink>
          )}
        </div>
      </div>

      <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
        <PWAInstallButton variant="sidebar" />
        {firebaseUser ? (
          <div className="space-y-2">
            {profile && (
              <button
                type="button"
                onClick={() => navigate('/profile')}
                className="hidden lg:flex w-full items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-left transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-display font-bold text-xs flex items-center justify-center shrink-0 overflow-hidden">
                  {profile.avatarUrl ? (
                    <img
                      src={profile.avatarUrl}
                      alt={profile.displayName}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    profile.displayName.slice(0, 1).toUpperCase()
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {profile.displayName}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                    @{profile.username}
                  </p>
                </div>
              </button>
            )}
            <button
              type="button"
              onClick={() => void logout()}
              className="w-full flex items-center justify-center lg:justify-start gap-2.5 px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-all whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              title="Sign out"
            >
              <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className="hidden lg:inline">Sign out</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => navigate('/auth')}
            className="w-full flex items-center justify-center lg:justify-start gap-2.5 px-3.5 py-2.5 min-h-[44px] rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 active:scale-[0.99] transition-all whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
            title="Sign in to AINEMAX"
          >
            <LogIn className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="hidden lg:inline">Sign in</span>
          </button>
        )}
      </div>
    </aside>
  );
}
