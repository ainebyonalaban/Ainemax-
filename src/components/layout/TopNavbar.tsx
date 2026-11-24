import React, { useEffect, useState } from 'react';
import { Bell, LogIn, LogOut, Menu, Plus, Search, Shield, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { subscribeUserNotifications } from '../../services/notificationService';
import { PRIMARY_NAV_ITEMS } from '../../types/navigation';
import { AinemaxLogo } from '../brand/AinemaxLogo';
import { PWAInstallButton } from '../pwa/PWAInstallButton';
import { UploadCategoryTab, UploadHubModal } from '../social/UploadHubModal';
import { NavIcon } from './NavIcons';

export function TopNavbar() {
  const [query, setQuery] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [uploadHubOpen, setUploadHubOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { firebaseUser, isVerifiedIdentity, profile, isAdmin, logout } = useAuth();

  useEffect(() => {
    if (!firebaseUser || !isVerifiedIdentity) {
      setUnreadCount(0);
      return;
    }
    const unsub = subscribeUserNotifications(firebaseUser.uid, (items) => {
      setUnreadCount(items.filter((i) => !i.read).length);
    });
    return () => unsub();
  }, [firebaseUser, isVerifiedIdentity]);

  const currentItem = PRIMARY_NAV_ITEMS.find((item) =>
    item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path)
  );
  const pageTitle =
    location.pathname.startsWith('/admin')
      ? 'Admin Portal'
      : location.pathname.startsWith('/auth')
        ? 'Account Access'
        : location.pathname.startsWith('/onboarding')
          ? 'Profile Setup'
          : currentItem?.label ?? 'AINEMAX';

  const defaultUploadCategory: UploadCategoryTab = location.pathname.startsWith('/movies')
    ? 'long'
    : location.pathname.startsWith('/stories')
      ? 'story'
      : location.pathname.startsWith('/videos')
        ? 'short'
        : 'photo';

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed) {
      if (location.pathname.startsWith('/movies')) {
        navigate(`/movies?q=${encodeURIComponent(trimmed)}`);
      } else {
        navigate(`/explore?q=${encodeURIComponent(trimmed)}`);
      }
    } else {
      navigate('/explore');
    }
  };

  const handleNavigateMobile = (path: string) => {
    setMobileMenuOpen(false);
    navigate(path);
  };

  return (
    <>
      <header className="sticky top-0 z-30 h-[52px] md:h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-3 sm:px-4 lg:px-6 flex items-center justify-between gap-3 transition-colors">
        <div className="flex items-center gap-2.5 min-w-0 shrink-0">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open all AINEMAX pages"
            className="md:hidden w-10 h-10 flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Menu className="w-5 h-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="md:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-lg"
            aria-label="AINEMAX Home"
          >
            <AinemaxLogo showWordmark size="sm" />
          </button>
          <h1 className="hidden md:block text-base lg:text-lg font-bold text-slate-900 dark:text-white tracking-tight whitespace-nowrap truncate">
            {pageTitle}
          </h1>
        </div>

        <form
          onSubmit={handleSearchSubmit}
          className="hidden sm:flex items-center flex-1 max-w-md relative"
          role="search"
          aria-label="Search AINEMAX"
        >
          <Search
            className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people, movies, videos, groups..."
            className="w-full h-10 pl-10 pr-9 rounded-xl bg-slate-100 dark:bg-slate-800 border border-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2.5 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-md"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </form>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <PWAInstallButton variant="compact" />
          <button
            type="button"
            onClick={() => {
              if (!firebaseUser) {
                navigate('/auth');
                return;
              }
              if (!profile?.onboardingComplete) {
                navigate('/onboarding');
                return;
              }
              setUploadHubOpen(true);
            }}
            aria-label="Upload video, photo, or story"
            className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span className="hidden sm:inline">Upload</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/explore')}
            aria-label="Search and explore"
            className="sm:hidden w-10 h-10 flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <Search className="w-5 h-5" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => navigate('/notifications')}
            aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
            className={`relative w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
              location.pathname === '/notifications'
                ? 'bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Bell className="w-5 h-5" aria-hidden="true" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {firebaseUser ? (
            <button
              type="button"
              onClick={() => navigate(profile?.onboardingComplete ? '/profile' : '/onboarding')}
              className="hidden sm:inline-flex items-center gap-2 px-3 py-2 min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs sm:text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              {profile?.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt={profile.displayName}
                  referrerPolicy="no-referrer"
                  className="w-6 h-6 rounded-lg object-cover shrink-0"
                />
              ) : (
                <span className="w-6 h-6 rounded-lg bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                  {(profile?.displayName || firebaseUser.email || 'A').slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="hidden lg:inline truncate max-w-[110px]">
                {profile?.username ? `@${profile.username}` : 'Complete Setup'}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/auth?mode=register')}
              className="px-3.5 py-2 min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs sm:text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
            >
              Sign in
            </button>
          )}
        </div>
      </header>

      {/* Mobile Full Destination Drawer */}
      {mobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 flex items-end bg-slate-950/60 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="All AINEMAX destinations"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="w-full bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 rounded-t-3xl p-5 pb-safe max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-4" aria-hidden="true" />
            <div className="flex items-center justify-between mb-4">
              <AinemaxLogo showWordmark size="sm" />
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation menu"
                className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 mb-4">
              {PRIMARY_NAV_ITEMS.map((item) => {
                const active =
                  item.path === '/'
                    ? location.pathname === '/'
                    : location.pathname.startsWith(item.path);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavigateMobile(item.path)}
                    className={`flex items-center gap-3 p-3 min-h-[48px] rounded-xl border text-left transition-colors ${
                      active
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 hover:bg-blue-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <NavIcon id={item.id} className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span className="text-sm font-medium truncate">{item.label}</span>
                  </button>
                );
              })}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => handleNavigateMobile('/admin')}
                  className="flex items-center gap-3 p-3 min-h-[48px] rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 hover:bg-blue-50 dark:hover:bg-slate-800 text-left transition-colors text-slate-800 dark:text-slate-200"
                >
                  <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
                  <span className="text-sm font-medium truncate">Admin Portal</span>
                </button>
              )}
            </div>

            <div className="space-y-2.5">
              <PWAInstallButton variant="drawer" />

              {firebaseUser ? (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    void logout();
                  }}
                  className="w-full h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-900 dark:bg-slate-800 text-white text-sm font-medium flex items-center justify-center gap-2 hover:bg-slate-800 dark:hover:bg-slate-700 transition-colors"
                >
                  <LogOut className="w-4 h-4" aria-hidden="true" />
                  <span>Sign out</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleNavigateMobile('/auth')}
                  className="w-full h-12 rounded-xl bg-blue-600 text-white text-sm font-medium flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors"
                >
                  <LogIn className="w-4 h-4" aria-hidden="true" />
                  <span>Sign in or Register</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {uploadHubOpen && (
        <UploadHubModal
          initialCategory={defaultUploadCategory}
          onClose={() => setUploadHubOpen(false)}
          onSuccess={(cat) => {
            if (cat === 'short') navigate('/videos');
            else if (cat === 'long') navigate('/movies');
            else if (cat === 'story') navigate('/stories');
            else navigate('/');
          }}
        />
      )}
    </>
  );
}
