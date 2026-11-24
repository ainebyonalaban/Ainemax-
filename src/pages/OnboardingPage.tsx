import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  LogOut,
  MailCheck,
  RefreshCw,
  UserCheck,
} from 'lucide-react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AinemaxLogo } from '../components/brand/AinemaxLogo';
import { formatFirebaseAuthError, useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { AccountType, PROFILE_CONSTRAINTS } from '../types/user';

export function OnboardingPage() {
  const {
    firebaseUser,
    authReady,
    isVerifiedIdentity,
    profile,
    profileLoading,
    resendVerificationEmail,
    refreshAuthUser,
    checkUsernameAvailable,
    completeOnboardingProfile,
    logout,
  } = useAuth();
  const { preferences } = usePreferences();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTarget =
    (location.state as { from?: string } | null)?.from || '/profile';

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('personal');
  const [usernameStatus, setUsernameStatus] = useState<
    'idle' | 'checking' | 'available' | 'taken' | 'invalid'
  >('idle');
  const [submitting, setSubmitting] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (firebaseUser?.displayName && !displayName) {
      setDisplayName(firebaseUser.displayName.slice(0, PROFILE_CONSTRAINTS.DISPLAY_NAME_MAX));
    }
  }, [firebaseUser, displayName]);

  useEffect(() => {
    if (!firebaseUser || isVerifiedIdentity) return;
    const checkFocus = () => {
      void refreshAuthUser();
    };
    window.addEventListener('focus', checkFocus);
    return () => window.removeEventListener('focus', checkFocus);
  }, [firebaseUser, isVerifiedIdentity, refreshAuthUser]);

  useEffect(() => {
    const clean = username.trim().toLowerCase();
    if (!clean) {
      setUsernameStatus('idle');
      return;
    }
    if (
      clean.length < PROFILE_CONSTRAINTS.USERNAME_MIN ||
      clean.length > PROFILE_CONSTRAINTS.USERNAME_MAX ||
      !PROFILE_CONSTRAINTS.USERNAME_REGEX.test(clean)
    ) {
      setUsernameStatus('invalid');
      return;
    }
    if (!isVerifiedIdentity) return;

    let cancelled = false;
    setUsernameStatus('checking');
    const timer = window.setTimeout(async () => {
      try {
        const available = await checkUsernameAvailable(clean);
        if (!cancelled) {
          setUsernameStatus(available ? 'available' : 'taken');
        }
      } catch {
        if (!cancelled) setUsernameStatus('idle');
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [username, isVerifiedIdentity, checkUsernameAvailable]);

  if (!authReady || (firebaseUser && isVerifiedIdentity && profileLoading)) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950 flex items-center justify-center p-6">
        <div className="flex items-center gap-3 text-sm font-medium text-slate-600 dark:text-slate-300">
          <Loader2 className="w-5 h-5 text-blue-600 animate-spin" aria-hidden="true" />
          <span>Loading account setup...</span>
        </div>
      </div>
    );
  }

  if (!firebaseUser) {
    return <Navigate to="/auth" replace />;
  }

  if (profile?.onboardingComplete) {
    return <Navigate to={redirectTarget} replace />;
  }

  const handleResendEmail = async () => {
    setErrorMsg(null);
    setStatusNotice(null);
    try {
      await resendVerificationEmail();
      setStatusNotice(`Verification email sent to ${firebaseUser.email}. Check your inbox and spam folder.`);
    } catch (err) {
      setErrorMsg(formatFirebaseAuthError(err));
    }
  };

  const handleRefreshVerification = async () => {
    setErrorMsg(null);
    setStatusNotice(null);
    try {
      const verified = await refreshAuthUser();
      if (!verified) {
        setStatusNotice('Your email is still unverified. Click the verification link in your email first.');
      }
    } catch (err) {
      setErrorMsg(formatFirebaseAuthError(err));
    }
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusNotice(null);
    setSubmitting(true);
    try {
      await completeOnboardingProfile({
        username,
        displayName,
        bio,
        accountType,
        language: preferences.language,
      });
      navigate(redirectTarget, { replace: true });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save profile.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950 flex flex-col justify-between p-4 sm:p-8">
      <div className="max-w-2xl w-full mx-auto flex items-center justify-between">
        <AinemaxLogo size="md" />
        <button
          type="button"
          onClick={() => void logout()}
          className="inline-flex items-center gap-2 px-3.5 py-2 min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          <LogOut className="w-4 h-4" aria-hidden="true" />
          <span>Sign out</span>
        </button>
      </div>

      <div className="max-w-xl w-full mx-auto my-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8">
        {!isVerifiedIdentity ? (
          <div className="space-y-5">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <MailCheck className="w-6 h-6" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                Verify your email address
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">
                We sent a verification link to{' '}
                <span className="font-semibold text-slate-900 dark:text-white">{firebaseUser.email}</span>.
                Verify your email to secure your account and complete your AINEMAX profile.
              </p>
            </div>

            {statusNotice && (
              <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-xs sm:text-sm text-blue-900 dark:text-blue-200">
                {statusNotice}
              </div>
            )}

            {errorMsg && (
              <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs sm:text-sm text-red-800 dark:text-red-200 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={() => void handleRefreshVerification()}
                className="flex-1 inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
              >
                <RefreshCw className="w-4 h-4" aria-hidden="true" />
                <span>I verified my email</span>
              </button>
              <button
                type="button"
                onClick={() => void handleResendEmail()}
                className="h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Resend email
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleProfileSubmit} className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                <UserCheck className="w-5 h-5" aria-hidden="true" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                  Complete your profile
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                  Choose a unique handle and public display details for AINEMAX
                </p>
              </div>
            </div>

            <div>
              <label htmlFor="onb-username" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Username
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-mono">
                  @
                </span>
                <input
                  id="onb-username"
                  type="text"
                  required
                  minLength={PROFILE_CONSTRAINTS.USERNAME_MIN}
                  maxLength={PROFILE_CONSTRAINTS.USERNAME_MAX}
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  placeholder="your_handle"
                  className="w-full h-11 pl-8 pr-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                />
              </div>
              <div className="mt-1.5 text-xs flex items-center gap-1.5">
                {usernameStatus === 'checking' && (
                  <span className="text-slate-500 dark:text-slate-400">Checking availability...</span>
                )}
                {usernameStatus === 'available' && (
                  <span className="text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                    Username is available
                  </span>
                )}
                {usernameStatus === 'taken' && (
                  <span className="text-red-600 dark:text-red-400">Username is already taken</span>
                )}
                {usernameStatus === 'invalid' && (
                  <span className="text-amber-700 dark:text-amber-400">
                    Use 3–30 lowercase letters, numbers, or underscores
                  </span>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="onb-display-name" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Display Name
              </label>
              <input
                id="onb-display-name"
                type="text"
                required
                maxLength={PROFILE_CONSTRAINTS.DISPLAY_NAME_MAX}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your full name or creator title"
                className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
              />
            </div>

            <div>
              <label htmlFor="onb-account-type" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Account Type
              </label>
              <select
                id="onb-account-type"
                value={accountType}
                onChange={(e) => setAccountType(e.target.value as AccountType)}
                className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
              >
                <option value="personal">Personal Profile</option>
                <option value="creator">Creator Profile</option>
                <option value="business">Business Page Account</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="onb-bio" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Biography (optional)
                </label>
                <span className="text-xs text-slate-400 font-mono tabular-nums">
                  {bio.length}/{PROFILE_CONSTRAINTS.BIO_MAX}
                </span>
              </div>
              <textarea
                id="onb-bio"
                rows={3}
                maxLength={PROFILE_CONSTRAINTS.BIO_MAX}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell the AINEMAX community what you create or care about..."
                className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 resize-none"
              />
            </div>

            {errorMsg && (
              <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs sm:text-sm text-red-800 dark:text-red-200 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{errorMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || usernameStatus === 'taken' || usernameStatus === 'invalid'}
              className="w-full h-11 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              <span>{submitting ? 'Saving profile...' : 'Save and continue'}</span>
            </button>
          </form>
        )}
      </div>

      <footer className="max-w-2xl w-full mx-auto text-center text-xs text-slate-400">
        AINEMAX Global Network · Secure Profile Onboarding
      </footer>
    </div>
  );
}
