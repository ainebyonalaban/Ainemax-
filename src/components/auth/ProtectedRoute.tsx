import React from 'react';
import { Loader2, Lock } from 'lucide-react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireCompletedProfile?: boolean;
  requireAdmin?: boolean;
}

export function ProtectedRoute({
  children,
  requireCompletedProfile = true,
  requireAdmin = false,
}: ProtectedRouteProps) {
  const {
    firebaseUser,
    authReady,
    isVerifiedIdentity,
    profile,
    profileLoading,
    isAdmin,
  } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (!authReady || (firebaseUser && isVerifiedIdentity && profileLoading)) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-10 flex flex-col items-center justify-center text-center gap-3">
        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" aria-hidden="true" />
        <p className="text-sm font-medium text-slate-600">Verifying your AINEMAX session...</p>
      </div>
    );
  }

  if (!firebaseUser) {
    return <Navigate to="/auth" state={{ from: location.pathname }} replace />;
  }

  if (!isVerifiedIdentity) {
    if (location.pathname !== '/onboarding') {
      return <Navigate to="/onboarding" state={{ from: location.pathname }} replace />;
    }
    return <>{children}</>;
  }

  if (requireCompletedProfile && !profile?.onboardingComplete) {
    if (location.pathname !== '/onboarding') {
      return <Navigate to="/onboarding" state={{ from: location.pathname }} replace />;
    }
  }

  if (requireAdmin && !isAdmin) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center text-red-600 mx-auto">
          <Lock className="w-6 h-6" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Administrator Access Denied</h2>
        <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
          Your account does not hold verified administrator privileges. Administrative routes are restricted by Firestore security rules and role verification.
        </p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="px-4 py-2.5 min-h-[44px] rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          Return to Home
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
