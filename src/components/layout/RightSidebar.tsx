import React, { useEffect, useState } from 'react';
import { ArrowUpRight, BadgeCheck, Compass, Radio, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  fetchActiveUsers,
  followUser,
  subscribeUserBlocks,
  subscribeUserFollowing,
  unfollowUser,
} from '../../services/socialService';
import { UserPublicProfile } from '../../types/user';

export function RightSidebar() {
  const navigate = useNavigate();
  const { firebaseUser, isVerifiedIdentity, profile, logout } = useAuth();
  const [suggested, setSuggested] = useState<UserPublicProfile[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!firebaseUser || !isVerifiedIdentity) {
      setSuggested([]);
      setFollowingIds(new Set());
      setBlockedIds(new Set());
      return;
    }

    fetchActiveUsers(10).then((users) => {
      setSuggested(users.filter((u) => u.uid !== firebaseUser.uid));
    });
    const unsubFollows = subscribeUserFollowing(firebaseUser.uid, setFollowingIds);
    const unsubBlocks = subscribeUserBlocks(firebaseUser.uid, setBlockedIds);
    return () => {
      unsubFollows();
      unsubBlocks();
    };
  }, [firebaseUser, isVerifiedIdentity]);

  const visibleSuggestions = suggested
    .filter((u) => !blockedIds.has(u.uid))
    .slice(0, 5);

  const handleToggleFollow = async (target: UserPublicProfile) => {
    if (!profile) {
      navigate('/onboarding');
      return;
    }
    if (followingIds.has(target.uid)) {
      await unfollowUser(profile.uid, target.uid);
    } else {
      await followUser(profile, target);
    }
  };

  return (
    <aside
      aria-label="Contextual sidebar"
      className="hidden xl:flex flex-col gap-5 w-[320px] shrink-0 sticky top-16 h-[calc(100vh-4rem)] py-6 pr-6 overflow-y-auto"
    >
      {/* Brand Identity / Authenticated Account Card */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
        <p className="text-xs font-semibold tracking-wider text-blue-600 dark:text-blue-400 mb-2">
          CONNECT • CREATE • SHARE • DISCOVER
        </p>

        {firebaseUser && profile ? (
          <>
            <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight mb-0.5 truncate">
              {profile.displayName}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mb-3 truncate">
              @{profile.username}
            </p>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => navigate('/profile')}
                className="flex-1 px-4 py-2.5 min-h-[44px] rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
              >
                View profile
              </button>
              <button
                type="button"
                onClick={() => void logout()}
                className="px-4 py-2.5 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                Sign out
              </button>
            </div>
          </>
        ) : firebaseUser ? (
          <>
            <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight mb-1.5">
              Finish Account Setup
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
              Complete email verification and your public AINEMAX profile to unlock posts, messaging, and communities.
            </p>
            <button
              type="button"
              onClick={() => navigate('/onboarding')}
              className="w-full px-4 py-2.5 min-h-[44px] rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Complete onboarding
            </button>
          </>
        ) : (
          <>
            <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight mb-1.5">
              Welcome to AINEMAX
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
              A global social network built for real-time conversations, short vertical video, stories, and communities.
            </p>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => navigate('/auth?mode=register')}
                className="flex-1 px-4 py-2.5 min-h-[44px] rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                Create account
              </button>
              <button
                type="button"
                onClick={() => navigate('/auth')}
                className="px-4 py-2.5 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                Sign in
              </button>
            </div>
          </>
        )}
      </section>

      {/* Suggested Accounts Container (Real Firestore Users) */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Suggested accounts</h3>
          <button
            type="button"
            onClick={() => navigate('/explore?tab=people')}
            className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 inline-flex items-center gap-1 whitespace-nowrap shrink-0"
          >
            <span>Directory</span>
            <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        {!firebaseUser ? (
          <div className="py-5 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-center">
            <UserPlus className="w-5 h-5 text-slate-400 mx-auto mb-2" aria-hidden="true" />
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Sign in to discover and follow AINEMAX creators.
            </p>
          </div>
        ) : visibleSuggestions.length === 0 ? (
          <div className="py-5 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-center">
            <UserPlus className="w-5 h-5 text-slate-400 mx-auto mb-2" aria-hidden="true" />
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              No additional active accounts to suggest right now.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {visibleSuggestions.map((user) => {
              const isFollowing = followingIds.has(user.uid);
              return (
                <li key={user.uid} className="flex items-center justify-between gap-2.5">
                  <button
                    type="button"
                    onClick={() => navigate(`/u/${user.username}`)}
                    className="flex items-center gap-2.5 min-w-0 text-left group"
                  >
                    <div className="w-9 h-9 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-display font-bold text-xs flex items-center justify-center shrink-0 overflow-hidden">
                      {user.avatarUrl ? (
                        <img
                          src={user.avatarUrl}
                          alt={user.displayName}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        user.displayName.slice(0, 1).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate">
                          {user.displayName}
                        </span>
                        {user.isVerified && (
                          <BadgeCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                        @{user.username}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleToggleFollow(user)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      isFollowing
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {isFollowing ? 'Following' : 'Follow'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Trending & Live Container */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Trending & Live</h3>
          <button
            type="button"
            onClick={() => navigate('/live')}
            className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 inline-flex items-center gap-1 whitespace-nowrap shrink-0"
          >
            <Radio className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Live hub</span>
          </button>
        </div>
        <div className="py-5 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-center">
          <Compass className="w-5 h-5 text-slate-400 mx-auto mb-2" aria-hidden="true" />
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Explore trending posts &amp; videos in Explore or join Live Streaming rooms.
          </p>
        </div>
      </section>

      <footer className="px-2 text-xs text-slate-400 dark:text-slate-500 leading-relaxed">
        <span>AINEMAX Global Network</span>
        <span aria-hidden="true" className="mx-1.5">·</span>
        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="hover:text-slate-600 dark:hover:text-slate-300 underline-offset-2 hover:underline"
        >
          Privacy & Terms
        </button>
      </footer>
    </aside>
  );
}
