import React, { useCallback, useEffect, useState } from 'react';
import {
  BadgeCheck,
  CheckCircle2,
  Eye,
  Loader2,
  Megaphone,
  PowerOff,
  Radio,
  Shield,
  ShieldCheck,
  Sliders,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  deleteGroupAsAdmin,
  deletePageAsAdmin,
  fetchActiveGroups,
  fetchActivePages,
} from '../services/communityService';
import {
  AdminStats,
  adminCreateAd,
  adminCreateAnnouncement,
  adminDeleteAd,
  adminDeleteAnnouncement,
  adminFetchAllAds,
  adminFetchAllUsers,
  adminFetchLogs,
  adminFetchReports,
  adminSavePlatformSettings,
  adminSetUserStatus,
  adminSetUserVerification,
  adminToggleAdActive,
  adminUpdateReportStatus,
  adminVerifyPage,
  endLiveStreamRoom,
  fetchAdminStats,
  fetchAnnouncements,
  fetchPlatformSettings,
  recordAdminLog,
  subscribeLiveStreams,
} from '../services/liveAndAdminService';
import { deletePost } from '../services/socialService';
import { removeVideoAsAdmin } from '../services/videoService';
import {
  AdminLog,
  Advertisement,
  Announcement,
  CreatorOrBusinessPage,
  Group,
  LiveStream,
} from '../types/features';
import { ReportRecord } from '../types/social';
import { AccountStatus, UserPublicProfile } from '../types/user';

type AdminTab = 'users' | 'reports' | 'live' | 'communities' | 'broadcasts' | 'settings' | 'logs';

export function AdminPage() {
  const { firebaseUser, profile } = useAuth();
  const [tab, setTab] = useState<AdminTab>('users');
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState<AdminStats>({
    users: 0,
    posts: 0,
    videos: 0,
    groups: 0,
    pages: 0,
    reports: 0,
  });
  const [users, setUsers] = useState<UserPublicProfile[]>([]);
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [liveStreams, setLiveStreams] = useState<LiveStream[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [pages, setPages] = useState<CreatorOrBusinessPage[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [logs, setLogs] = useState<AdminLog[]>([]);

  // Forms
  const [userSearch, setUserSearch] = useState('');
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');
  const [adTitle, setAdTitle] = useState('');
  const [adSponsor, setAdSponsor] = useState('');
  const [adDesc, setAdDesc] = useState('');
  const [adUrl, setAdUrl] = useState('');

  // Settings
  const [allowRegistrations, setAllowRegistrations] = useState(true);
  const [allowLiveStreaming, setAllowLiveStreaming] = useState(true);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maxUploadMb, setMaxUploadMb] = useState(50);
  const [notice, setNotice] = useState<string | null>(null);

  const adminActor = {
    uid: firebaseUser?.uid || '',
    email: firebaseUser?.email || 'admin',
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, u, r, g, pg, an, adList, lg, cfg] = await Promise.all([
        fetchAdminStats(),
        adminFetchAllUsers(),
        adminFetchReports(),
        fetchActiveGroups(),
        fetchActivePages(),
        fetchAnnouncements(),
        adminFetchAllAds(),
        adminFetchLogs(),
        fetchPlatformSettings(),
      ]);
      setStats(s);
      setUsers(u);
      setReports(r);
      setGroups(g);
      setPages(pg);
      setAnnouncements(an);
      setAds(adList);
      setLogs(lg);
      if (cfg) {
        setAllowRegistrations(cfg.allowRegistrations);
        setAllowLiveStreaming(cfg.allowLiveStreaming);
        setMaintenanceMode(cfg.maintenanceMode);
        setMaxUploadMb(cfg.maxUploadMb);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
    const unsubLive = subscribeLiveStreams(setLiveStreams);
    return () => unsubLive();
  }, [loadAll]);

  const filteredUsers = users.filter((u) => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      u.username.toLowerCase().includes(q) ||
      u.displayName.toLowerCase().includes(q)
    );
  });

  const activeLiveCount = liveStreams.filter((s) => s.status === 'live').length;
  const cardCls =
    'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4';
  const inputCls =
    'h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100';

  return (
    <div className="space-y-5">
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
              <Shield className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                AINEMAX Administration Portal
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Verification approvals, live stream oversight, safety moderation &amp; immutable audit logs
              </p>
            </div>
          </div>

          <div className="inline-flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            <span>
              Authorized: {profile?.username ? `@${profile.username}` : firebaseUser?.email}
            </span>
          </div>
        </div>

        {/* Platform Telemetry Counts */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: 'Users', val: stats.users },
            { label: 'Posts', val: stats.posts },
            { label: 'Videos', val: stats.videos },
            { label: 'Live Now', val: activeLiveCount },
            { label: 'Groups', val: stats.groups },
            { label: 'Pages', val: stats.pages },
            { label: 'Reports', val: stats.reports },
          ].map((stat) => (
            <div
              key={stat.label}
              className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800"
            >
              <p className="text-xs text-slate-500 dark:text-slate-400">{stat.label}</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
                {stat.val}
              </p>
            </div>
          ))}
        </div>

        {/* Admin Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1">
          {(
            [
              { id: 'users', label: 'Users & Badges' },
              { id: 'reports', label: `Reports (${reports.filter((r) => r.status === 'pending').length})` },
              { id: 'live', label: `Live Streams (${activeLiveCount})` },
              { id: 'communities', label: 'Groups & Pages' },
              { id: 'broadcasts', label: 'Announcements & Ads' },
              { id: 'settings', label: 'Settings' },
              { id: 'logs', label: 'Audit Logs' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3.5 py-2 min-h-[38px] rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
                tab === t.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      {notice && (
        <div className="bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 rounded-2xl px-4 py-3 text-xs text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {loading ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          <span>Loading admin data...</span>
        </div>
      ) : (
        <>
          {tab === 'users' && (
            <section className={cardCls}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  User Verification &amp; Status
                </h3>
                <input
                  type="search"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Filter by name or @username..."
                  className={`${inputCls} w-full sm:w-64`}
                />
              </div>

              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredUsers.map((u) => (
                  <li
                    key={u.uid}
                    className="py-3.5 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">
                          {u.displayName}
                        </span>
                        {u.isVerified && <BadgeCheck className="w-4 h-4 text-blue-600" />}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-mono">@{u.username}</span> · Status:{' '}
                        <span className="capitalize font-semibold">{u.accountStatus}</span>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          await adminSetUserVerification(u, !u.isVerified, adminActor);
                          setNotice(
                            `${u.isVerified ? 'Revoked' : 'Approved'} badge for @${u.username}`
                          );
                          await loadAll();
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                          u.isVerified
                            ? 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                      >
                        {u.isVerified ? 'Revoke Badge' : 'Approve Verified'}
                      </button>

                      <select
                        aria-label={`Account status for ${u.username}`}
                        value={u.accountStatus}
                        onChange={async (e) => {
                          const nextStatus = e.target.value as AccountStatus;
                          await adminSetUserStatus(u, nextStatus, adminActor);
                          setNotice(`Set @${u.username} status to ${nextStatus}`);
                          await loadAll();
                        }}
                        className="h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100"
                      >
                        <option value="active">Active</option>
                        <option value="suspended">Suspended</option>
                        <option value="banned">Banned</option>
                      </select>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {tab === 'reports' && (
            <section className={cardCls}>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Safety Report Queue
              </h3>
              {reports.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No safety reports submitted.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {reports.map((rep) => (
                    <li key={rep.id} className="py-3.5 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-bold text-slate-900 dark:text-white capitalize">
                          {rep.targetType} Report · {rep.reason}
                        </p>
                        <span className="text-xs font-semibold capitalize text-blue-600 dark:text-blue-400">
                          {rep.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        Target ID: <span className="font-mono">{rep.targetId}</span>
                        {rep.details ? ` — ${rep.details}` : ''}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={async () => {
                            await adminUpdateReportStatus(rep.id, 'resolved', adminActor);
                            setNotice(`Marked report ${rep.id} resolved`);
                            await loadAll();
                          }}
                          className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
                        >
                          Mark Resolved
                        </button>
                        {rep.targetType === 'post' && (
                          <button
                            type="button"
                            onClick={async () => {
                              await deletePost(rep.targetId, rep.reporterId).catch(() => {});
                              await adminUpdateReportStatus(rep.id, 'resolved', adminActor);
                              await loadAll();
                            }}
                            className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700"
                          >
                            Delete Reported Post
                          </button>
                        )}
                        {rep.targetType === 'video' && (
                          <button
                            type="button"
                            onClick={async () => {
                              await removeVideoAsAdmin(rep.targetId);
                              await adminUpdateReportStatus(rep.id, 'resolved', adminActor);
                              await loadAll();
                            }}
                            className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700"
                          >
                            Remove Video
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {tab === 'live' && (
            <section className={cardCls}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Radio className="w-4 h-4 text-red-600" aria-hidden="true" />
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Live Broadcast Moderation ({activeLiveCount} Live)
                  </h3>
                </div>
              </div>

              {liveStreams.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No live broadcasts recorded yet.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {liveStreams.map((stream) => (
                    <li
                      key={stream.id}
                      className="py-3.5 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded-md ${
                              stream.status === 'live'
                                ? 'bg-red-600 text-white'
                                : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            {stream.status}
                          </span>
                          <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                            {stream.title}
                          </p>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-2">
                          <span className="font-mono">@{stream.hostUsername}</span>
                          <span>·</span>
                          <span>{stream.category || 'General'}</span>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1 tabular-nums">
                            <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                            {stream.viewerCount} viewers
                          </span>
                        </p>
                      </div>

                      {stream.status === 'live' && (
                        <button
                          type="button"
                          onClick={async () => {
                            await endLiveStreamRoom(stream.id);
                            await recordAdminLog({
                              adminId: adminActor.uid,
                              adminEmail: adminActor.email,
                              action: 'end_live_stream',
                              targetType: 'liveStream',
                              targetId: stream.id,
                              summary: `Ended live broadcast "${stream.title}" (@${stream.hostUsername})`,
                            });
                            setNotice(`Ended live stream "${stream.title}"`);
                            await loadAll();
                          }}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shrink-0"
                        >
                          <PowerOff className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>End Broadcast</span>
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {tab === 'communities' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <section className={cardCls}>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Groups ({groups.length})
                </h3>
                {groups.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">No active groups.</p>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {groups.map((g) => (
                      <li key={g.id} className="py-2.5 flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">
                            {g.name}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {g.privacy} · {g.membersCount} members
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            await deleteGroupAsAdmin(g.id);
                            setNotice(`Deleted group "${g.name}"`);
                            await loadAll();
                          }}
                          className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg"
                          aria-label={`Delete ${g.name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className={cardCls}>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Pages ({pages.length})
                </h3>
                {pages.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">No active pages.</p>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {pages.map((pg) => (
                      <li key={pg.id} className="py-2.5 flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">
                            {pg.name} {pg.isVerified ? '✓' : ''}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                            @{pg.handle}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={async () => {
                              await adminVerifyPage(pg.id, pg.name, !pg.isVerified, adminActor);
                              await loadAll();
                            }}
                            className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200"
                          >
                            {pg.isVerified ? 'Unverify' : 'Verify'}
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await deletePageAsAdmin(pg.id);
                              await loadAll();
                            }}
                            className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg"
                            aria-label={`Delete ${pg.name}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}

          {tab === 'broadcasts' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <section className={cardCls}>
                <div className="flex items-center gap-2">
                  <Megaphone className="w-4 h-4 text-blue-600" />
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Publish Announcement
                  </h3>
                </div>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await adminCreateAnnouncement(adminActor, annTitle, annBody);
                    setAnnTitle('');
                    setAnnBody('');
                    setNotice('Platform announcement published.');
                    await loadAll();
                  }}
                  className="space-y-3"
                >
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={120}
                    value={annTitle}
                    onChange={(e) => setAnnTitle(e.target.value)}
                    placeholder="Announcement title"
                    className={`w-full ${inputCls}`}
                  />
                  <textarea
                    rows={3}
                    required
                    minLength={2}
                    maxLength={1000}
                    value={annBody}
                    onChange={(e) => setAnnBody(e.target.value)}
                    placeholder="Announcement message shown on Home feed..."
                    className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 resize-none"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
                  >
                    Publish Announcement
                  </button>
                </form>

                {announcements.length > 0 && (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800 pt-2">
                    {announcements.map((a) => (
                      <li key={a.id} className="py-2.5 flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-bold text-slate-900 dark:text-white">{a.title}</p>
                          <p className="text-xs text-slate-600 dark:text-slate-300">{a.body}</p>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            await adminDeleteAnnouncement(a.id, adminActor);
                            await loadAll();
                          }}
                          className="text-red-600 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className={cardCls}>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Sponsored Ads Manager
                </h3>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await adminCreateAd(adminActor, {
                      title: adTitle,
                      sponsorName: adSponsor,
                      description: adDesc,
                      targetUrl: adUrl,
                    });
                    setAdTitle('');
                    setAdSponsor('');
                    setAdDesc('');
                    setAdUrl('');
                    setNotice('Sponsored placement created.');
                    await loadAll();
                  }}
                  className="space-y-2.5"
                >
                  <input
                    type="text"
                    required
                    value={adTitle}
                    onChange={(e) => setAdTitle(e.target.value)}
                    placeholder="Campaign title"
                    className={`w-full ${inputCls}`}
                  />
                  <input
                    type="text"
                    required
                    value={adSponsor}
                    onChange={(e) => setAdSponsor(e.target.value)}
                    placeholder="Sponsor name"
                    className={`w-full ${inputCls}`}
                  />
                  <input
                    type="url"
                    required
                    value={adUrl}
                    onChange={(e) => setAdUrl(e.target.value)}
                    placeholder="https://sponsor.example.com"
                    className={`w-full ${inputCls}`}
                  />
                  <input
                    type="text"
                    value={adDesc}
                    onChange={(e) => setAdDesc(e.target.value)}
                    placeholder="Short ad copy"
                    className={`w-full ${inputCls}`}
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
                  >
                    Create Ad
                  </button>
                </form>

                {ads.length > 0 && (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800 pt-2">
                    {ads.map((ad) => (
                      <li key={ad.id} className="py-2.5 flex items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-bold text-slate-900 dark:text-white">{ad.title}</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {ad.sponsorName} · {ad.active ? 'Active' : 'Paused'}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={async () => {
                              await adminToggleAdActive(ad.id, !ad.active, adminActor);
                              await loadAll();
                            }}
                            className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-200"
                          >
                            {ad.active ? 'Pause' : 'Activate'}
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await adminDeleteAd(ad.id, adminActor);
                              await loadAll();
                            }}
                            className="text-red-600 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}

          {tab === 'settings' && (
            <section className={cardCls}>
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Global Platform Settings
                </h3>
              </div>

              <div className="space-y-3">
                <label className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-sm text-slate-800 dark:text-slate-200">
                    Allow new user registrations
                  </span>
                  <input
                    type="checkbox"
                    checked={allowRegistrations}
                    onChange={(e) => setAllowRegistrations(e.target.checked)}
                    className="w-5 h-5 text-blue-600 rounded"
                  />
                </label>
                <label className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-sm text-slate-800 dark:text-slate-200">
                    Enable Live Streaming rooms
                  </span>
                  <input
                    type="checkbox"
                    checked={allowLiveStreaming}
                    onChange={(e) => setAllowLiveStreaming(e.target.checked)}
                    className="w-5 h-5 text-blue-600 rounded"
                  />
                </label>
                <label className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-sm text-slate-800 dark:text-slate-200">Maintenance mode</span>
                  <input
                    type="checkbox"
                    checked={maintenanceMode}
                    onChange={(e) => setMaintenanceMode(e.target.checked)}
                    className="w-5 h-5 text-blue-600 rounded"
                  />
                </label>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-slate-800 dark:text-slate-200">
                    Max video upload limit (MB)
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={maxUploadMb}
                    onChange={(e) => setMaxUploadMb(Number(e.target.value) || 50)}
                    className={`w-24 ${inputCls}`}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={async () => {
                  await adminSavePlatformSettings(adminActor, {
                    allowRegistrations,
                    allowLiveStreaming,
                    maintenanceMode,
                    maxUploadMb,
                  });
                  setNotice('Platform settings saved and logged.');
                  await loadAll();
                }}
                className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
              >
                Save Platform Settings
              </button>
            </section>
          )}

          {tab === 'logs' && (
            <section className={cardCls}>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Immutable Admin Audit Trail
              </h3>
              {logs.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No admin actions recorded yet.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {logs.map((lg) => (
                    <li key={lg.id} className="py-2.5 text-xs">
                      <p className="font-semibold text-slate-900 dark:text-white">{lg.summary}</p>
                      <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                        Action: <span className="font-mono">{lg.action}</span> · By {lg.adminEmail}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
