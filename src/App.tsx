/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AppShell } from './components/layout/AppShell';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { OfflineIndicator } from './components/pwa/OfflineIndicator';
import { AuthProvider } from './context/AuthContext';
import { PreferencesProvider } from './context/PreferencesContext';
import { PWAProvider } from './context/PWAContext';
import { HomePage } from './pages/HomePage';

const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })));
const AuthPage = lazy(() => import('./pages/AuthPage').then((m) => ({ default: m.AuthPage })));
const ExplorePage = lazy(() =>
  import('./pages/ExplorePage').then((m) => ({ default: m.ExplorePage }))
);
const GroupsPage = lazy(() => import('./pages/GroupsPage').then((m) => ({ default: m.GroupsPage })));
const LivePage = lazy(() => import('./pages/LivePage').then((m) => ({ default: m.LivePage })));
const MessagesPage = lazy(() =>
  import('./pages/MessagesPage').then((m) => ({ default: m.MessagesPage }))
);
const MoviesPage = lazy(() => import('./pages/MoviesPage').then((m) => ({ default: m.MoviesPage })));
const NotificationsPage = lazy(() =>
  import('./pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage }))
);
const OnboardingPage = lazy(() =>
  import('./pages/OnboardingPage').then((m) => ({ default: m.OnboardingPage }))
);
const ProfilePage = lazy(() =>
  import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage }))
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage }))
);
const StoriesPage = lazy(() =>
  import('./pages/StoriesPage').then((m) => ({ default: m.StoriesPage }))
);
const UserProfilePage = lazy(() =>
  import('./pages/UserProfilePage').then((m) => ({ default: m.UserProfilePage }))
);
const VideosPage = lazy(() => import('./pages/VideosPage').then((m) => ({ default: m.VideosPage })));

function RouteFallback() {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
      <Loader2 className="w-5 h-5 animate-spin text-blue-600" aria-hidden="true" />
      <span>Loading...</span>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <PreferencesProvider>
          <PWAProvider>
            <BrowserRouter>
              <AppShell>
                <Suspense fallback={<RouteFallback />}>
                  <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/videos" element={<VideosPage />} />
                    <Route path="/movies" element={<MoviesPage />} />
                    <Route path="/explore" element={<ExplorePage />} />
                    <Route path="/stories" element={<StoriesPage />} />
                    <Route path="/groups" element={<GroupsPage />} />
                    <Route path="/live" element={<LivePage />} />
                    <Route path="/u/:username" element={<UserProfilePage />} />
                    <Route path="/auth" element={<AuthPage />} />
                    <Route
                      path="/onboarding"
                      element={
                        <ProtectedRoute requireCompletedProfile={false}>
                          <OnboardingPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/messages"
                      element={
                        <ProtectedRoute>
                          <MessagesPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/notifications"
                      element={
                        <ProtectedRoute>
                          <NotificationsPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/profile"
                      element={
                        <ProtectedRoute>
                          <ProfilePage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/settings"
                      element={
                        <ProtectedRoute>
                          <SettingsPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/admin"
                      element={
                        <ProtectedRoute requireAdmin>
                          <AdminPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Suspense>
              </AppShell>
              <OfflineIndicator />
            </BrowserRouter>
          </PWAProvider>
        </PreferencesProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
