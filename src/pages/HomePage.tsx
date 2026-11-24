import React, { useCallback, useEffect, useState } from 'react';
import type { DocumentSnapshot } from 'firebase/firestore';
import {
  CircleDot,
  Clapperboard,
  ExternalLink,
  Film,
  Loader2,
  Megaphone,
  Plus,
  Radio,
  RefreshCw,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PostCard } from '../components/social/PostCard';
import { PostComposer } from '../components/social/PostComposer';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { fetchActiveAds, fetchAnnouncements } from '../services/liveAndAdminService';
import {
  fetchFollowingPosts,
  fetchPostById,
  fetchPublicPostsPage,
  fetchUserProfileById,
  followUser,
  subscribeUserBlocks,
  subscribeUserFollowing,
  subscribeUserLikes,
  unfollowUser,
} from '../services/socialService';
import { fetchActiveStories } from '../services/storyService';
import { getLookaheadCount, scheduleVideoPreloadQueue } from '../services/videoPreloadService';
import { Advertisement, Announcement, Story } from '../types/features';
import { Post } from '../types/social';

type FeedTab = 'for-you' | 'following';

export function HomePage() {
  const [activeTab, setActiveTab] = useState<FeedTab>('for-you');
  const [posts, setPosts] = useState<Post[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursorDoc, setCursorDoc] = useState<DocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const [quoteTarget, setQuoteTarget] = useState<Post | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const sharedPostIdParam = searchParams.get('post');
  const [pinnedPost, setPinnedPost] = useState<Post | null>(null);

  const navigate = useNavigate();
  const { preferences } = usePreferences();
  const { firebaseUser, isVerifiedIdentity, profile } = useAuth();

  useEffect(() => {
    if (!firebaseUser || !isVerifiedIdentity) {
      setLikedIds(new Set());
      setFollowingIds(new Set());
      setBlockedIds(new Set());
      setAnnouncements([]);
      return;
    }
    const unsubLikes = subscribeUserLikes(firebaseUser.uid, setLikedIds);
    const unsubFollows = subscribeUserFollowing(firebaseUser.uid, setFollowingIds);
    const unsubBlocks = subscribeUserBlocks(firebaseUser.uid, setBlockedIds);
    fetchAnnouncements().then(setAnnouncements).catch(() => setAnnouncements([]));
    return () => {
      unsubLikes();
      unsubFollows();
      unsubBlocks();
    };
  }, [firebaseUser, isVerifiedIdentity]);

  useEffect(() => {
    fetchActiveStories().then(setStories).catch(() => setStories([]));
    fetchActiveAds().then(setAds).catch(() => setAds([]));
  }, []);

  useEffect(() => {
    if (!sharedPostIdParam) {
      setPinnedPost(null);
      return;
    }
    fetchPostById(sharedPostIdParam).then(setPinnedPost);
  }, [sharedPostIdParam]);

  const loadFeed = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === 'for-you') {
        const res = await fetchPublicPostsPage(15, null);
        setPosts(res.posts);
        setCursorDoc(res.lastDoc);
        setHasMore(res.hasMore);
      } else {
        if (!firebaseUser || followingIds.size === 0) {
          setPosts([]);
          setCursorDoc(null);
          setHasMore(false);
        } else {
          const followingPosts = await fetchFollowingPosts(Array.from(followingIds));
          setPosts(followingPosts);
          setCursorDoc(null);
          setHasMore(false);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [activeTab, firebaseUser, followingIds]);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  const handleLoadMore = async () => {
    if (!cursorDoc || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetchPublicPostsPage(15, cursorDoc);
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const next = res.posts.filter((p) => !seen.has(p.id));
        return [...prev, ...next];
      });
      setCursorDoc(res.lastDoc);
      setHasMore(res.hasMore);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleToggleFollow = async (targetUid: string) => {
    if (!profile) {
      navigate('/auth');
      return;
    }
    if (followingIds.has(targetUid)) {
      await unfollowUser(profile.uid, targetUid);
    } else {
      const targetProfile = await fetchUserProfileById(targetUid);
      if (targetProfile) {
        await followUser(profile, targetProfile);
      }
    }
  };

  const visiblePosts = posts.filter((p) => !blockedIds.has(p.authorId));
  const uniqueStoryAuthors = Array.from(
    new Map(stories.map((s) => [s.authorId, s])).values()
  ).slice(0, 8);

  useEffect(() => {
    const autoDownloadEnabled =
      preferences.autoDownloadNextVideos &&
      !preferences.dataSaverMode &&
      preferences.preloadMode !== 'off';
    if (!autoDownloadEnabled) return;

    const lookahead = getLookaheadCount(preferences.preloadMode, preferences.dataSaverMode);
    const feedVideos = visiblePosts
      .filter((p) => p.mediaType === 'video' && p.mediaUrls?.[0])
      .slice(0, Math.max(1, lookahead))
      .map((p) => ({ url: p.mediaUrls![0], maxFullBytes: 35 * 1024 * 1024 }));

    if (feedVideos.length === 0) return;
    return scheduleVideoPreloadQueue(feedVideos, {
      enabled: true,
      concurrency: 1,
    });
  }, [
    posts,
    blockedIds,
    preferences.autoDownloadNextVideos,
    preferences.preloadMode,
    preferences.dataSaverMode,
  ]);

  return (
    <div className={preferences.compactDensity ? 'space-y-4' : 'space-y-5'}>
      {/* Platform Announcement Banner (if published by Admin) */}
      {announcements.length > 0 && (
        <section className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-2xl p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
            <Megaphone className="w-4 h-4" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">Platform Announcement</p>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5">{announcements[0].title}</h2>
            <p className="text-xs text-slate-700 dark:text-slate-300 mt-1 leading-relaxed">{announcements[0].body}</p>
          </div>
        </section>
      )}

      {/* Feed Switcher */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-1.5 flex items-center gap-1">
        <button
          type="button"
          onClick={() => setActiveTab('for-you')}
          className={`flex-1 py-2.5 px-4 min-h-[44px] rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === 'for-you'
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          For You
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('following')}
          className={`flex-1 py-2.5 px-4 min-h-[44px] rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === 'following'
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          Following
        </button>
      </div>

      {/* Mobile Quick-Access Channel Strip */}
      <nav
        aria-label="Mobile feature shortcuts"
        className="md:hidden flex items-center gap-2 overflow-x-auto pb-0.5"
      >
        {[
          { to: '/videos', label: 'Short Videos', icon: Clapperboard },
          { to: '/movies', label: 'Movies', icon: Film },
          { to: '/live', label: 'LIVE', icon: Radio },
          { to: '/stories', label: 'Stories', icon: CircleDot },
          { to: '/groups', label: 'Groups', icon: Users },
          { to: '/settings', label: 'Settings', icon: Settings },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.to}
              type="button"
              onClick={() => navigate(item.to)}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 shrink-0 transition-colors"
            >
              <Icon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Live 24-Hour Stories Strip */}
      <section
        aria-label="Stories strip"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CircleDot className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">24-Hour Stories</h2>
          </div>
          <button
            type="button"
            onClick={() => navigate('/stories')}
            className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            View all
          </button>
        </div>

        <div className="flex items-center gap-3 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => navigate('/stories')}
            className="flex flex-col items-center gap-1.5 shrink-0 w-16"
          >
            <div className="w-14 h-14 rounded-full border-2 border-dashed border-blue-400 bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-950 transition-colors">
              <Plus className="w-5 h-5" aria-hidden="true" />
            </div>
            <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300 truncate w-full text-center">
              Add Story
            </span>
          </button>

          {uniqueStoryAuthors.map((story) => (
            <button
              key={story.id}
              type="button"
              onClick={() => navigate('/stories')}
              className="flex flex-col items-center gap-1.5 shrink-0 w-16"
            >
              <div className="w-14 h-14 rounded-full p-0.5 ring-2 ring-blue-600 overflow-hidden bg-slate-100 dark:bg-slate-800">
                {story.authorAvatarUrl ? (
                  <img
                    src={story.authorAvatarUrl}
                    alt={story.authorDisplayName}
                    referrerPolicy="no-referrer"
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full rounded-full bg-blue-600 text-white font-bold text-sm flex items-center justify-center">
                    {story.authorDisplayName.slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>
              <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300 truncate w-full text-center">
                @{story.authorUsername}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Post Composer */}
      {quoteTarget && (
        <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-2xl p-3.5 flex items-center justify-between gap-3">
          <p className="text-xs text-blue-900 dark:text-blue-200 truncate">
            Reposting <span className="font-semibold">@{quoteTarget.authorUsername}</span>: “
            {quoteTarget.caption}”
          </p>
          <button
            type="button"
            onClick={() => setQuoteTarget(null)}
            aria-label="Cancel repost"
            className="p-1 text-blue-700 dark:text-blue-300 hover:text-blue-900"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      <PostComposer
        sharedPostId={quoteTarget?.id}
        onPostCreated={() => {
          setQuoteTarget(null);
          void loadFeed();
        }}
      />

      {/* Sponsored Placement (only if active ads exist in Firestore) */}
      {ads.length > 0 && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-slate-400">
              Sponsored · {ads[0].sponsorName}
            </p>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{ads[0].title}</h3>
            {ads[0].description && (
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-2">{ads[0].description}</p>
            )}
          </div>
          {/^https?:\/\//i.test(ads[0].targetUrl) && (
            <a
              href={ads[0].targetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[38px] rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 shrink-0"
            >
              <span>Visit</span>
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
          )}
        </section>
      )}

      {/* Shared Permalink Post */}
      {pinnedPost && !blockedIds.has(pinnedPost.authorId) && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">Shared Post</span>
            <button
              type="button"
              onClick={() => {
                searchParams.delete('post');
                setSearchParams(searchParams);
              }}
              className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            >
              Dismiss
            </button>
          </div>
          <PostCard
            post={pinnedPost}
            isLiked={likedIds.has(pinnedPost.id)}
            isFollowingAuthor={followingIds.has(pinnedPost.authorId)}
            onToggleFollowAuthor={(uid) => void handleToggleFollow(uid)}
            onPostDeleted={() => setPinnedPost(null)}
            onQuoteShare={(p) => setQuoteTarget(p)}
          />
        </div>
      )}

      {/* Feed Header & Refresh */}
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
          {activeTab === 'for-you' ? 'Latest Community Posts' : 'Posts From People You Follow'}
        </h2>
        <button
          type="button"
          onClick={() => void loadFeed()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Feed Content */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((n) => (
            <div
              key={n}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3 animate-pulse"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-3.5 w-32 bg-slate-200 dark:bg-slate-800 rounded" />
                  <div className="h-3 w-20 bg-slate-100 dark:bg-slate-800/70 rounded" />
                </div>
              </div>
              <div className="h-4 w-full bg-slate-100 dark:bg-slate-800/70 rounded" />
              <div className="h-4 w-2/3 bg-slate-100 dark:bg-slate-800/70 rounded" />
            </div>
          ))}
        </div>
      ) : visiblePosts.length === 0 ? (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center space-y-3">
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {activeTab === 'following'
              ? firebaseUser
                ? 'Your Following feed is empty'
                : 'Sign in to view your Following feed'
              : 'No posts published yet'}
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
            {activeTab === 'following'
              ? firebaseUser
                ? 'Follow creators from For You or Explore to see their latest posts here.'
                : 'Sign in with your AINEMAX account to follow creators and customize your feed.'
              : 'Be the first to publish a post to the AINEMAX community feed.'}
          </p>
          <div className="pt-1">
            {activeTab === 'following' && !firebaseUser ? (
              <button
                type="button"
                onClick={() => navigate('/auth')}
                className="px-4 py-2.5 min-h-[44px] rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
              >
                Sign in
              </button>
            ) : activeTab === 'following' ? (
              <button
                type="button"
                onClick={() => navigate('/explore?tab=people')}
                className="px-4 py-2.5 min-h-[44px] rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
              >
                Discover people
              </button>
            ) : null}
          </div>
        </section>
      ) : (
        <div className="space-y-4">
          {visiblePosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              isLiked={likedIds.has(post.id)}
              isFollowingAuthor={followingIds.has(post.authorId)}
              onToggleFollowAuthor={(uid) => void handleToggleFollow(uid)}
              onPostDeleted={(deletedId) =>
                setPosts((prev) => prev.filter((item) => item.id !== deletedId))
              }
              onPostUpdated={(updatedId, nextCaption) =>
                setPosts((prev) =>
                  prev.map((item) =>
                    item.id === updatedId
                      ? { ...item, caption: nextCaption, edited: true }
                      : item
                  )
                )
              }
              onQuoteShare={(p) => {
                setQuoteTarget(p);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          ))}

          {hasMore && (
            <div className="pt-2 flex justify-center">
              <button
                type="button"
                onClick={() => void handleLoadMore()}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                {loadingMore && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                <span>{loadingMore ? 'Loading...' : 'Load more posts'}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
