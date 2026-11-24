import React, { useEffect, useState } from 'react';
import type { ConfirmationResult } from 'firebase/auth';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Loader2,
  Mail,
  Phone,
  ShieldCheck,
} from 'lucide-react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AinemaxLogo } from '../components/brand/AinemaxLogo';
import { formatFirebaseAuthError, useAuth } from '../context/AuthContext';

type AuthMode = 'login' | 'register' | 'phone' | 'forgot' | 'reset';

export function AuthPage() {
  const {
    firebaseUser,
    authReady,
    isVerifiedIdentity,
    profile,
    profileLoading,
    signInWithEmail,
    registerWithEmail,
    signInWithGoogle,
    sendPhoneOtp,
    confirmPhoneOtp,
    sendPasswordReset,
    confirmResetCode,
  } = useAuth();

  const [searchParams, setSearchParams] = useSearchParams();
  const initialParam = searchParams.get('mode');
  const oobCode = searchParams.get('oobCode') || '';
  const resolvedInitial: AuthMode =
    initialParam === 'register' ||
    initialParam === 'phone' ||
    initialParam === 'forgot' ||
    (initialParam === 'resetPassword' && oobCode)
      ? initialParam === 'resetPassword'
        ? 'reset'
        : initialParam
      : 'login';

  const [mode, setMode] = useState<AuthMode>(resolvedInitial);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [phoneConfirmation, setPhoneConfirmation] = useState<ConfirmationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const navigate = useNavigate();
  const location = useLocation();
  const redirectTarget =
    (location.state as { from?: string } | null)?.from || '/';

  useEffect(() => {
    const param = searchParams.get('mode');
    if (param === 'register' || param === 'phone' || param === 'forgot') {
      setMode(param);
    } else if (param === 'resetPassword' && oobCode) {
      setMode('reset');
    } else if (!param) {
      setMode('login');
    }
  }, [searchParams, oobCode]);

  if (authReady && firebaseUser && (!isVerifiedIdentity || !profileLoading)) {
    if (!isVerifiedIdentity || !profile?.onboardingComplete) {
      return <Navigate to="/onboarding" state={{ from: redirectTarget }} replace />;
    }
    return <Navigate to={redirectTarget} replace />;
  }

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setErrorMsg(null);
    setSuccessMsg(null);
    setPhoneConfirmation(null);
    setOtpCode('');
    if (nextMode === 'login') {
      setSearchParams({});
    } else if (nextMode !== 'reset') {
      setSearchParams({ mode: nextMode });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setBusy(true);

    try {
      if (mode === 'login') {
        await signInWithEmail(email, password);
      } else if (mode === 'register') {
        await registerWithEmail(email, password);
        navigate('/onboarding', { replace: true });
      } else if (mode === 'phone') {
        if (!phoneConfirmation) {
          const confirmation = await sendPhoneOtp(
            phoneNumber,
            'ainemax-recaptcha-container'
          );
          setPhoneConfirmation(confirmation);
          setSuccessMsg(`Verification code sent to ${phoneNumber.trim()}.`);
        } else {
          await confirmPhoneOtp(phoneConfirmation, otpCode);
        }
      } else if (mode === 'forgot') {
        await sendPasswordReset(email);
        setSuccessMsg(`Password reset instructions sent to ${email.trim()}.`);
      } else if (mode === 'reset') {
        await confirmResetCode(oobCode, newPassword);
        setSuccessMsg('Password updated successfully. You can now sign in.');
        switchMode('login');
      }
    } catch (err) {
      setErrorMsg(formatFirebaseAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleLogin = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setErrorMsg(formatFirebaseAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950 flex flex-col justify-between p-4 sm:p-8">
      <div className="max-w-5xl w-full mx-auto flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 px-3.5 py-2 min-h-[44px] rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-900 border border-transparent hover:border-slate-200 dark:hover:border-slate-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>Back to AINEMAX</span>
        </button>
        <AinemaxLogo size="md" />
      </div>

      <div className="max-w-5xl w-full mx-auto my-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left Brand Story Panel */}
        <section className="lg:col-span-6 bg-blue-600 text-white rounded-3xl p-8 sm:p-10 flex flex-col justify-between">
          <div>
            <AinemaxLogo size="lg" inverted />
            <p className="text-xs font-semibold tracking-wider text-blue-100 mt-6">
              CONNECT • CREATE • SHARE • DISCOVER
            </p>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mt-3 leading-tight [text-wrap:balance]">
              One global network for conversations, short video, and communities.
            </h1>
            <p className="text-sm sm:text-base text-blue-100 mt-4 leading-relaxed max-w-md">
              Secured with Firebase Authentication, verified identities, and zero-trust Firestore security rules.
            </p>
          </div>

          <div className="mt-10 pt-6 border-t border-blue-500/50 space-y-2.5 text-sm text-blue-50">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 text-blue-200 shrink-0" aria-hidden="true" />
              <span>Email & password, Google Sign-In, and Phone OTP</span>
            </div>
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 text-blue-200 shrink-0" aria-hidden="true" />
              <span>Guided profile onboarding after registration</span>
            </div>
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 text-blue-200 shrink-0" aria-hidden="true" />
              <span>Persistent encrypted authentication sessions</span>
            </div>
          </div>
        </section>

        {/* Right Auth Form Card */}
        <section className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-9 flex flex-col justify-center">
          {mode !== 'reset' && (
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-6">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className={`py-2 min-h-[40px] rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                  mode === 'login'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => switchMode('register')}
                className={`py-2 min-h-[40px] rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                  mode === 'register'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Register
              </button>
              <button
                type="button"
                onClick={() => switchMode('phone')}
                className={`py-2 min-h-[40px] rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                  mode === 'phone'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Phone OTP
              </button>
            </div>
          )}

          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight mb-1">
            {mode === 'login' && 'Sign in to your account'}
            {mode === 'register' && 'Create your AINEMAX account'}
            {mode === 'phone' && 'Continue with phone number'}
            {mode === 'forgot' && 'Reset your password'}
            {mode === 'reset' && 'Choose a new password'}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            {mode === 'login' && 'Enter your email and password or continue with Google.'}
            {mode === 'register' && 'Register with email, verify your address, and complete your profile.'}
            {mode === 'phone' && 'Verify your phone number with a one-time SMS passcode.'}
            {mode === 'forgot' && 'We will send a password reset link to your registered email.'}
            {mode === 'reset' && 'Enter a strong new password for your AINEMAX account.'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'phone' ? (
              <>
                <div>
                  <label htmlFor="auth-phone" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Phone Number (E.164 format)
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                    <input
                      id="auth-phone"
                      type="tel"
                      required
                      disabled={Boolean(phoneConfirmation)}
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="+15550109988"
                      className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 disabled:bg-slate-50 dark:disabled:bg-slate-800/50 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                    />
                  </div>
                </div>

                {phoneConfirmation && (
                  <div>
                    <label htmlFor="auth-otp" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      6-Digit Verification Code
                    </label>
                    <input
                      id="auth-otp"
                      type="text"
                      inputMode="numeric"
                      required
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="123456"
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono tracking-widest text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                    />
                  </div>
                )}
              </>
            ) : mode === 'reset' ? (
              <div>
                <label htmlFor="auth-new-password" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  New Password
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                  <input
                    id="auth-new-password"
                    type="password"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label htmlFor="auth-email" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                  <input
                    id="auth-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                  />
                </div>
              </div>
            )}

            {(mode === 'login' || mode === 'register') && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="auth-password" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Password
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => switchMode('forgot')}
                      className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <input
                  id="auth-password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                />
              </div>
            )}

            <div id="ainemax-recaptcha-container" />

            <button
              type="submit"
              disabled={busy}
              className="w-full h-11 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              <span>
                {mode === 'login' && 'Sign in'}
                {mode === 'register' && 'Create account'}
                {mode === 'phone' && (phoneConfirmation ? 'Verify OTP code' : 'Send verification code')}
                {mode === 'forgot' && 'Send reset link'}
                {mode === 'reset' && 'Update password'}
              </span>
            </button>

            {mode === 'phone' && phoneConfirmation && (
              <button
                type="button"
                onClick={() => {
                  setPhoneConfirmation(null);
                  setOtpCode('');
                }}
                className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Use a different phone number
              </button>
            )}

            {mode === 'forgot' && (
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Return to Sign in
              </button>
            )}
          </form>

          {(mode === 'login' || mode === 'register') && (
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleGoogleLogin()}
                className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2.5"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                  />
                </svg>
                <span>Continue with Google</span>
              </button>
            </div>
          )}

          {errorMsg && (
            <div
              role="alert"
              className="mt-4 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs sm:text-sm text-red-900 dark:text-red-200 flex items-start gap-2.5"
            >
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div
              role="status"
              className="mt-4 p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs sm:text-sm text-emerald-900 dark:text-emerald-200 flex items-start gap-2.5"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{successMsg}</span>
            </div>
          )}
        </section>
      </div>

      <footer className="max-w-5xl w-full mx-auto text-center text-xs text-slate-400 py-2">
        AINEMAX Global Social Network · Firebase Authentication Active
      </footer>
    </div>
  );
}
