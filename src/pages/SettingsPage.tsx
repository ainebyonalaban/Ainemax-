import React, { useState } from 'react';
import {
  Accessibility,
  BadgeCheck,
  Bell,
  Check,
  CheckCircle2,
  Copy,
  Database,
  ExternalLink,
  Film,
  Globe,
  HelpCircle,
  Info,
  KeyRound,
  Lock,
  LogOut,
  Monitor,
  Moon,
  Palette,
  RotateCcw,
  Sun,
  Trash2,
  User,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatFirebaseAuthError, useAuth } from '../context/AuthContext';
import { ThemeMode, VideoPreloadMode, usePreferences } from '../context/PreferencesContext';
import { MEDIA_CACHE_BUCKET } from '../services/mediaUploadService';
import { requestPushNotificationPermission } from '../services/notificationService';
import { ProfileVisibility } from '../types/user';
import { PWAInstallButton } from '../components/pwa/PWAInstallButton';

export function SettingsPage() {
  const { preferences, resolvedTheme, updatePreference, resetPreferences } = usePreferences();
  const {
    firebaseUser,
    profile,
    privateInfo,
    updateAccountPrivacy,
    sendPasswordReset,
    saveFcmToken,
    logout,
  } = useAuth();
  const navigate = useNavigate();

  const [visibility, setVisibility] = useState<ProfileVisibility>(
    privateInfo?.profileVisibility ?? 'public'
  );
  const [privacyStatus, setPrivacyStatus] = useState<string | null>(null);
  const [privacyError, setPrivacyError] = useState<string | null>(null);

  const [pushStatus, setPushStatus] = useState<string | null>(null);
  const [pushPermission, setPushPermission] = useState<string>(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return window.Notification.permission;
  });

  const [cacheNotice, setCacheNotice] = useState<string | null>(null);
  const [clearingCache, setClearingCache] = useState(false);
  const [copiedDiag, setCopiedDiag] = useState(false);

  const handleSavePrivacy = async (nextVisibility: ProfileVisibility, nextLang = preferences.language) => {
    setVisibility(nextVisibility);
    setPrivacyStatus(null);
    setPrivacyError(null);
    try {
      await updateAccountPrivacy({
        language: nextLang,
        profileVisibility: nextVisibility,
      });
      setPrivacyStatus('Account privacy & locale saved to Firestore.');
    } catch (err) {
      setPrivacyError(err instanceof Error ? err.message : 'Unable to save privacy setting.');
    }
  };

  const handleLanguageChange = async (nextLang: string) => {
    updatePreference('language', nextLang);
    if (firebaseUser) {
      await handleSavePrivacy(visibility, nextLang);
    }
  };

  const handlePasswordReset = async () => {
    if (!firebaseUser?.email) return;
    setPrivacyStatus(null);
    setPrivacyError(null);
    try {
      await sendPasswordReset(firebaseUser.email);
      setPrivacyStatus(`Password reset link sent to ${firebaseUser.email}.`);
    } catch (err) {
      setPrivacyError(formatFirebaseAuthError(err));
    }
  };

  const handleEnableNotifications = async () => {
    setPushStatus(null);
    const res = await requestPushNotificationPermission(saveFcmToken);
    setPushStatus(res.message);
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPushPermission(window.Notification.permission);
    }
  };

  const handleClearMediaCache = async () => {
    setClearingCache(true);
    setCacheNotice(null);
    try {
      let deletedCount = 0;
      if (typeof caches !== 'undefined') {
        const hadBucket = await caches.delete(MEDIA_CACHE_BUCKET);
        if (hadBucket) deletedCount += 1;
      }
      try {
        window.localStorage.removeItem('ainemax_dlurl_cache_v1');
      } catch {
        // Ignore storage error
      }
      setCacheNotice(
        deletedCount > 0
          ? 'Cleared cached media files and URL lookup cache.'
          : 'Media URL cache cleared. No cached binary files remained.'
      );
    } catch {
      setCacheNotice('Unable to inspect browser cache in this context.');
    } finally {
      setClearingCache(false);
    }
  };

  const handleCopyDiagnostics = async () => {
    const diag = [
      `App: AINEMAX Web Platform`,
      `Origin: ${window.location.origin}`,
      `SecureContext: ${window.isSecureContext}`,
      `Theme: ${preferences.theme} (resolved: ${resolvedTheme})`,
      `PreloadMode: ${preferences.preloadMode}`,
      `DataSaver: ${preferences.dataSaverMode}`,
      `NotificationPermission: ${pushPermission}`,
      `MediaDevicesAvailable: ${Boolean(navigator.mediaDevices?.getUserMedia)}`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(diag);
      setCopiedDiag(true);
      window.setTimeout(() => setCopiedDiag(false), 2000);
    } catch {
      // Ignore clipboard denial
    }
  };

  const cardCls =
    'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4';
  const selectCls =
    'h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 focus:border-blue-500 focus:outline-none';
  const dividerRowCls = 'border-t border-slate-100 dark:border-slate-800 pt-4';

  return (
    <div className="space-y-5">
      {/* Header Summary */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
            Settings & Preferences
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Manage your AINEMAX account, privacy, playback performance, themes, and accessibility
          </p>
        </div>
        <button
          type="button"
          onClick={resetPreferences}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Reset defaults</span>
        </button>
      </div>

      {/* 1. Account */}
      <section className={cardCls}>
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
              <User className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">1. Account</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Identity details and profile handle
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/profile')}
            className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors"
          >
            Edit Profile
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
            <p className="text-xs text-slate-400">Profile Identity</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className="font-semibold text-slate-900 dark:text-white truncate">
                {profile?.displayName || 'AINEMAX User'}
              </p>
              {profile?.isVerified && (
                <BadgeCheck className="w-4 h-4 text-blue-600 shrink-0" aria-label="Verified" />
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
              @{profile?.username || 'pending'} · {profile?.accountType || 'personal'}
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
            <p className="text-xs text-slate-400">Linked Contact (Private PII)</p>
            <p className="font-medium text-slate-900 dark:text-slate-100 mt-0.5 truncate">
              {privateInfo?.email || firebaseUser?.email || 'No email linked'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {privateInfo?.phoneNumber || firebaseUser?.phoneNumber || 'No phone number linked'}
            </p>
          </div>
        </div>
      </section>

      {/* 2. Privacy & Security */}
      <section className={cardCls}>
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
            <Lock className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              2. Privacy &amp; Security
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Stored securely in your isolated Firestore private subcollection
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              Profile visibility
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Control who can discover your profile and posts
            </p>
          </div>
          <select
            aria-label="Profile visibility"
            value={visibility}
            onChange={(e) => void handleSavePrivacy(e.target.value as ProfileVisibility)}
            className={selectCls}
          >
            <option value="public">Public (Everyone)</option>
            <option value="followers">Followers Only</option>
            <option value="private">Private</option>
          </select>
        </div>

        {firebaseUser?.email && (
          <div className={dividerRowCls}>
            <button
              type="button"
              onClick={() => void handlePasswordReset()}
              className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <KeyRound className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              <span>Send password reset email</span>
            </button>
          </div>
        )}

        {privacyStatus && (
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
            <span>{privacyStatus}</span>
          </div>
        )}
        {privacyError && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-800 dark:text-red-200">
            {privacyError}
          </div>
        )}
      </section>

      {/* 3. Notifications */}
      <section className={cardCls}>
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
            <Bell className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">3. Notifications</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Real-time activity alerts and browser push permission status
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              Browser Push Status:{' '}
              <span className="font-semibold capitalize text-blue-600 dark:text-blue-400">
                {pushPermission}
              </span>
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Receive instant alerts for likes, replies, messages, and live broadcasts
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleEnableNotifications()}
              className="px-4 py-2 min-h-[40px] rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
            >
              {pushPermission === 'granted' ? 'Sync Push Token' : 'Enable Push Alerts'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/notifications')}
              className="px-3.5 py-2 min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Open Inbox
            </button>
          </div>
        </div>

        {pushStatus && (
          <p className="text-xs text-blue-800 dark:text-blue-200 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 rounded-xl px-3.5 py-2.5">
            {pushStatus}
          </p>
        )}
      </section>

      {/* 4. Appearance & Themes */}
      <section className={cardCls}>
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
            <Palette className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              4. Appearance &amp; Themes
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Clean White &amp; Blue Light mode, sleek Dark mode, or automatic System sync
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          {(
            [
              { id: 'light', label: 'Light', icon: Sun },
              { id: 'dark', label: 'Dark', icon: Moon },
              { id: 'system', label: 'System', icon: Monitor },
            ] as const
          ).map(({ id, label, icon: Icon }) => {
            const active = preferences.theme === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => updatePreference('theme', id as ThemeMode)}
                className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl border text-xs sm:text-sm font-semibold transition-all ${
                  active
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 ring-1 ring-blue-600'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        <label className={`flex items-center justify-between gap-4 cursor-pointer ${dividerRowCls}`}>
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              Compact feed spacing
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Tighten vertical spacing between feed cards on desktop and mobile
            </p>
          </div>
          <input
            type="checkbox"
            checked={preferences.compactDensity}
            onChange={(e) => updatePreference('compactDensity', e.target.checked)}
            className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-600 cursor-pointer"
          />
        </label>
      </section>

      {/* 5. Language */}
      <section className={cardCls}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
              <Globe className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">5. Language</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Preferred display locale saved to your profile
              </p>
            </div>
          </div>
          <select
            aria-label="Interface Language"
            value={preferences.language}
            onChange={(e) => void handleLanguageChange(e.target.value)}
            className={selectCls}
          >
            <option value="English (Global)">English (Global)</option>
            <option value="French (Français)">French (Français)</option>
            <option value="Spanish (Español)">Spanish (Español)</option>
            <option value="Swahili (Kiswahili)">Swahili (Kiswahili)</option>
            <option value="Arabic (العربية)">Arabic (العربية)</option>
          </select>
        </div>
      </section>

      {/* 6. Accessibility */}
      <section className={cardCls}>
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
            <Accessibility className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              6. Accessibility
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Motion comfort and readable typography scaling
            </p>
          </div>
        </div>

        <label className="flex items-center justify-between gap-4 cursor-pointer">
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Reduce motion</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Minimize UI transitions and scroll animations across the platform
            </p>
          </div>
          <input
            type="checkbox"
            checked={preferences.reducedMotion}
            onChange={(e) => updatePreference('reducedMotion', e.target.checked)}
            className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-600 cursor-pointer"
          />
        </label>

        <label className={`flex items-center justify-between gap-4 cursor-pointer ${dividerRowCls}`}>
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              Larger readable text
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Increase base interface font scale for improved legibility
            </p>
          </div>
          <input
            type="checkbox"
            checked={preferences.largeText}
            onChange={(e) => updatePreference('largeText', e.target.checked)}
            className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-600 cursor-pointer"
          />
        </label>
      </section>

      {/* 7. Data Usage */}
      <section className={cardCls}>
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
            <Database className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">7. Data Usage</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Bandwidth controls and local CacheStorage cleanup
            </p>
          </div>
        </div>

        <label className="flex items-center justify-between gap-4 cursor-pointer">
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              Low-bandwidth data saver
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pause background video preloading on cellular or slower connections
            </p>
          </div>
          <input
            type="checkbox"
            checked={preferences.dataSaverMode}
            onChange={(e) => updatePreference('dataSaverMode', e.target.checked)}
            className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-600 cursor-pointer"
          />
        </label>

        <div className={`flex flex-wrap items-center justify-between gap-3 ${dividerRowCls}`}>
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              Offline &amp; Preload Cache
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Clear preloaded video chunks and cached download URLs stored in your browser
            </p>
          </div>
          <button
            type="button"
            disabled={clearingCache}
            onClick={() => void handleClearMediaCache()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-500" aria-hidden="true" />
            <span>{clearingCache ? 'Clearing...' : 'Clear Local Cache'}</span>
          </button>
        </div>

        {cacheNotice && (
          <p className="text-xs text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 rounded-xl px-3.5 py-2">
            {cacheNotice}
          </p>
        )}
      </section>

      {/* 8. Video Preferences */}
      <section className={cardCls}>
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
            <Film className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              8. Video Preferences
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Smart lookahead preloading for Short Videos and Movies
            </p>
          </div>
        </div>

        <label className="flex items-center justify-between gap-4 cursor-pointer">
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              Autoplay short videos
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Automatically start playback when vertical videos enter the viewport
            </p>
          </div>
          <input
            type="checkbox"
            checked={preferences.autoplayVideos}
            onChange={(e) => updatePreference('autoplayVideos', e.target.checked)}
            className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-600 cursor-pointer"
          />
        </label>

        <div className={`flex flex-wrap items-center justify-between gap-4 ${dividerRowCls}`}>
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              Video preload option
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Choose how many upcoming videos prepare silently after the current clip plays
            </p>
          </div>
          <select
            aria-label="Video preload option"
            value={preferences.preloadMode}
            onChange={(e) => updatePreference('preloadMode', e.target.value as VideoPreloadMode)}
            className={selectCls}
          >
            <option value="off">Off (Active video only)</option>
            <option value="standard">Standard (Next 2 videos)</option>
            <option value="high">High (Next 3 videos)</option>
          </select>
        </div>

        <label className={`flex items-center justify-between gap-4 cursor-pointer ${dividerRowCls}`}>
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              Auto-download next videos
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Buffer the next 1–2 videos ahead while watching to prevent mid-swipe stalls
            </p>
          </div>
          <input
            type="checkbox"
            checked={preferences.autoDownloadNextVideos}
            onChange={(e) => updatePreference('autoDownloadNextVideos', e.target.checked)}
            className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-600 cursor-pointer"
          />
        </label>

        <label className={`flex items-center justify-between gap-4 cursor-pointer ${dividerRowCls}`}>
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              Autoplay next related movie
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Automatically queue and start the next related movie when playback finishes
            </p>
          </div>
          <input
            type="checkbox"
            checked={preferences.autoPlayNextMovie}
            onChange={(e) => updatePreference('autoPlayNextMovie', e.target.checked)}
            className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-600 cursor-pointer"
          />
        </label>
      </section>

      {/* 9. Help & Support */}
      <section className={cardCls}>
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
            <HelpCircle className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              9. Help &amp; Support
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Android Chrome camera/mic permissions and diagnostics
            </p>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 space-y-1.5 leading-relaxed">
          <p className="font-semibold text-slate-900 dark:text-white">
            Fixing Camera &amp; Microphone Access for LIVE Streaming on Android Chrome:
          </p>
          <p>
            1. Open AINEMAX over HTTPS, tap the lock/tune icon beside the address bar → Permissions →
            set Camera &amp; Microphone to Allow.
          </p>
          <p>
            2. On Android OS: Settings → Apps → Chrome → Permissions → allow Camera &amp; Microphone
            and close any other video-call or recorder app holding the camera.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => navigate('/live')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-xs font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/60"
          >
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Test Camera in Live Studio</span>
          </button>
          <button
            type="button"
            onClick={() => void handleCopyDiagnostics()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            {copiedDiag ? (
              <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
            ) : (
              <Copy className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span>{copiedDiag ? 'Diagnostics Copied' : 'Copy Support Diagnostics'}</span>
          </button>
        </div>
      </section>

      {/* 10. About AINEMAX */}
      <section className={cardCls}>
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
            <Info className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              10. About AINEMAX
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Platform version, streaming architecture, and trust standards
            </p>
          </div>
        </div>
        <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 leading-relaxed">
          <p className="font-semibold text-slate-900 dark:text-slate-100">
            AINEMAX Global Social &amp; Entertainment Platform · v2.4
          </p>
          <p>
            Powered by Firebase Authentication, Cloud Firestore, Firebase Storage resumable CDN
            transfers, and real-time LiveKit WebRTC broadcasting.
          </p>
        </div>
        <PWAInstallButton variant="settings" />
      </section>

      {/* 11. Logout */}
      <section className={cardCls}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">11. Logout</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Sign out of your active AINEMAX session on this device
            </p>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl bg-slate-900 dark:bg-red-600 text-white text-sm font-semibold hover:bg-slate-800 dark:hover:bg-red-700 transition-colors"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            <span>Sign out</span>
          </button>
        </div>
      </section>
    </div>
  );
}
