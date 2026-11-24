import React from 'react';
import { useLocation } from 'react-router-dom';
import { LeftSidebar } from './LeftSidebar';
import { MobileBottomNav } from './MobileBottomNav';
import { RightSidebar } from './RightSidebar';
import { TopNavbar } from './TopNavbar';

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isVideosRoute = location.pathname === '/videos';
  const isAuthOrOnboarding =
    location.pathname.startsWith('/auth') ||
    location.pathname.startsWith('/onboarding');
  const isFullWidthWorkspace =
    location.pathname.startsWith('/messages') ||
    location.pathname.startsWith('/movies') ||
    location.pathname.startsWith('/live') ||
    location.pathname.startsWith('/admin');

  if (isAuthOrOnboarding) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
        {children}
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen flex transition-colors ${
        isVideosRoute
          ? 'bg-slate-950 text-white'
          : 'bg-[#F8FAFC] dark:bg-slate-950 text-slate-900 dark:text-slate-100'
      }`}
    >
      <LeftSidebar />

      <div className="flex-1 min-w-0 flex flex-col">
        {!isVideosRoute && <TopNavbar />}

        <div className="flex-1 flex justify-center">
          <main
            className={
              isVideosRoute
                ? 'w-full flex-1 flex flex-col'
                : isFullWidthWorkspace
                  ? 'w-full max-w-6xl px-4 sm:px-6 py-5 pb-24 md:pb-8'
                  : 'w-full max-w-3xl px-4 sm:px-6 py-5 pb-24 md:pb-8'
            }
          >
            {children}
          </main>

          {!isVideosRoute && !isFullWidthWorkspace && <RightSidebar />}
        </div>
      </div>

      <MobileBottomNav darkOverlay={isVideosRoute} />
    </div>
  );
}
