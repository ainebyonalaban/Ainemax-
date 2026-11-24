import React, { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  Briefcase,
  CircleDot,
  Clapperboard,
  Film,
  Loader2,
  PlaySquare,
  Radio,
  Search,
  Users,
  X,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PostCard } from '../components/social/PostCard';
import { useAuth } from '../context/AuthContext';
import { fetchActiveGroups, fetchActivePages } from '../services/communityService';
import {
  fetchActiveUsers,
  fetchPublicPostsPage,
  followUser,
  subscribeUserFollowing,
  subscribeUserLikes,
  unfollowUser,
} from '../services/socialService';
import { fetchShortVideosPage } from '../services/videoService';
import { CreatorOrBusinessPage, Group, ShortVideo } from '../types/features';
import { Post } from '../types/social';
import { UserPublicProfile } from '../types/user';

const EXPLORE_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'videos', label: 'Short Videos' },
  { id: 'movies', label: 'Movies' },
  { id: 'people', label: 'People' },
  { id: 'posts', label: 'Posts' },
  { id: 'groups', label: 'Groups' },
  { id: 'pages', label: 'Pages' },
] as const;

export function ExplorePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'all';
  const urlQuery = searchParams.get('q') || '';
  const [inputQuery, setInputQuery] = useState(urlQuery);

  const { firebaseUser, isVerifiedIdentity, profile } = useAuth();
  const navigate = useNavigate();

  const [users, setUsers] = useState<UserPublicProfile[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [videos, setVideos] = useState<ShortVideo[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [pages, setPages] = useState<CreatorOrBusinessPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setInputQuery(urlQuery);
  }, [urlQuery]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      firebaseUser && isVerifiedIdentity ? fetchActiveUsers(40) : Promise.resolve([]),
      fetchPublicPostsPage(30, null).then((res) => res.posts),
      fetchShortVideosPage(30, null).then((res) => res.videos),
      fetchActiveGroups(),
      fetchActivePages(),
    ])
      .then(([fetchedUsers, fetchedPosts, fetchedVideos, fetchedGroups, fetchedPages]) => {
        if (!active) return;
        setUsers(fetchedUsers.filter((u) => u.uid !== firebaseUser?.uid));
        setPosts(fetchedPosts);
        setVideos(fetchedVideos);
        setGroups(fetchedGroups);
        setPages(fetchedPages);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [firebaseUser, isVerifiedIdentity]);

  useEffect(() => {
    if (!firebaseUser || !isVerifiedIdentity) return;
    const unsubLikes = subscribeUserLikes(firebaseUser.uid, setLikedIds);
    const unsubFollows = subscribeUserFollowing(firebaseUser.uid, setFollowingIds);
    return () => {
      unsubLikes();
      unsubFollows();
    };
  }, [firebaseUser, isVerifiedIdentity]);

  const normalizedSearch = urlQuery.trim().toLowerCase();

  const filteredUsers = useMemo(() => {
    if (!normalizedSearch) return users;
    return users.filter(
      (u) =>
        u.displayName.toLowerCase().includes(normalizedSearch) ||
        u.username.toLowerCase().includes(normalizedSearch) ||
        u.bio.toLowerCase().includes(normalizedSearch)
    );
  }, [users, normalizedSearch]);

  const filteredPosts = useMemo(() => {
    if (!normalizedSearch) return posts;
    return posts.filter(
      (p) =>
        p.caption.toLowerCase().includes(normalizedSearch) ||
        p.authorDisplayName.toLowerCase().includes(normalizedSearch) ||
        p.authorUsername.toLowerCase().includes(normalizedSearch)
    );
  }, [posts, normalizedSearch]);

  const filteredShortVideos = useMemo(() => {
    const shorts = videos.filter((v) => v.videoFormat !== 'long');
    if (!normalizedSearch) return shorts;
    return shorts.filter(
      (v) =>
        v.caption.toLowerCase().includes(normalizedSearch) ||
        v.authorDisplayName.toLowerCase().includes(normalizedSearch) ||
        v.authorUsername.toLowerCase().includes(normalizedSearch) ||
        (v.hashtags || []).some((h) => h.includes(normalizedSearch.replace(/^#/, '')))
    );
  }, [videos, normalizedSearch]);

  const filteredMovies = useMemo(() => {
    const movies = videos.filter((v) => v.videoFormat === 'long');
    if (!normalizedSearch) return movies;
    return movies.filter(
      (m) =>
        (m.title || '').toLowerCase().includes(normalizedSearch) ||
        m.caption.toLowerCase().includes(normalizedSearch) ||
        m.authorDisplayName.toLowerCase().includes(normalizedSearch) ||
        m.authorUsername.toLowerCase().includes(normalizedSearch) ||
        (m.category || '').toLowerCase().includes(normalizedSearch)
    );
  }, [videos, normalizedSearch]);

  const filteredGroups = useMemo(() => {
    if (!normalizedSearch) return groups;
    return groups.filter(
      (g) =>
        g.name.toLowerCase().includes(normalizedSearch) ||
        g.description.toLowerCase().includes(normalizedSearch)
    );
  }, [groups, normalizedSearch]);

  const filteredPages = useMemo(() => {
    if (!normalizedSearch) return pages;
    return pages.filter(
      (pg) =>
        pg.name.toLowerCase().includes(normalizedSearch) ||
        pg.handle.toLowerCase().includes(normalizedSearch) ||
        pg.category.toLowerCase().includes(normalizedSearch)
    );
  }, [pages, normalizedSearch]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const next = new URLSearchParams(searchParams);
    if (inputQuery.trim()) {
      next.set('q', inputQuery.trim());
    } else {
      next.delete('q');
    }
    setSearchParams(next);
  };

  const handleCategoryChange = (tabId: string) => {
    const next = new URLSearchParams(searchParams);
    if (tabId === 'all') {
      next.delete('tab');
    } else {
      next.set('tab', tabId);
    }
    setSearchParams(next);
  };

  const clearQuery = () => {
    setInputQuery('');
    const next = new URLSearchParams(searchParams);
    next.delete('q');
    setSearchParams(next);
  };

  const handleToggleFollow = async (target: UserPublicProfile) => {
    if (!profile) {
      navigate('/auth');
      return;
    }
    if (followingIds.has(target.uid)) {
      await unfollowUser(profile.uid, target.uid);
    } else {
      await followUser(profile, target);
    }
  };

  const showPeople = activeTab === 'all' || activeTab === 'people';
  const showPosts = activeTab === 'all' || activeTab === 'posts';
  const showVideos = activeTab === 'all' || activeTab === 'videos';
  const showMovies = activeTab === 'all' || activeTab === 'movies';
  const showGroups = activeTab === 'all' || activeTab === 'groups';
  const showPages = activeTab === 'all' || activeTab === 'pages';

  return (
    <div className="space-y-5">
      {/* Discover Hub Quick Access */}
      <section
        aria-label="AINEMAX quick channels"
        className="grid grid-cols-2 sm:grid-cols-5 gap-2.5"
      >
        {[
          { label: 'Short Videos', path: '/videos', icon: PlaySquare },
          { label: 'Movies', path: '/movies', icon: Clapperboard },
          { label: 'LIVE Rooms', path: '/live', icon: Radio },
          { label: 'Stories', path: '/stories', icon: CircleDot },
          { label: 'Groups', path: '/groups', icon: Users },
        ].map(({ label, path, icon: Icon }) => (
          <button
            key={path}
            type="button"
            onClick={() => navigate(path)}
            className="flex items-center gap-2.5 p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-600 text-left transition-colors"
          >
            <span className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4" aria-hidden="true" />
            </span>
            <span className="text-xs font-bold text-slate-900 dark:text-white truncate">{label}</span>
          </button>
        ))}
      </section>

      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
        <form onSubmit={handleSearch} className="relative flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder="Search people, short videos, movies, posts, groups..."
              className="w-full h-11 pl-10 pr-9 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            {inputQuery && (
              <button
                type="button"
                onClick={clearQuery}
                aria-label="Clear search query"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="px-4 h-11 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
          >
            Search
          </button>
        </form>

        <div
          className="flex items-center gap-1.5 overflow-x-auto pb-1"
          role="tablist"
          aria-label="Explore category filters"
        >
          {EXPLORE_CATEGORIES.map((category) => {
            const isSelected = activeTab === category.id;
            return (
              <button
                key={category.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => handleCategoryChange(category.id)}
                className={`px-3.5 py-2 min-h-[40px] rounded-xl text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                  isSelected
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {category.label}
              </button>
            );
          })}
        </div>
      </section>

      {loading && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin text-blue-600" aria-hidden="true" />
          <span>Searching AINEMAX...</span>
        </div>
      )}

      {!loading && showPeople && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">People Directory</h2>
            {!firebaseUser && (
              <button
                type="button"
                onClick={() => navigate('/auth')}
                className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                Sign in to browse people
              </button>
            )}
          </div>
          {!firebaseUser ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              People discovery is protected for signed-in members. Sign in to search and follow creators.
            </p>
          ) : filteredUsers.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {normalizedSearch
                ? `No people found matching “${urlQuery}”.`
                : 'No other registered profiles found yet.'}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredUsers.map((u) => {
                const isFollowing = followingIds.has(u.uid);
                return (
                  <li key={u.uid} className="py-3 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => navigate(`/u/${u.username}`)}
                      className="flex items-center gap-3 min-w-0 text-left group"
                    >
                      <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-display font-bold text-sm flex items-center justify-center shrink-0 overflow-hidden">
                        {u.avatarUrl ? (
                          <img
                            src={u.avatarUrl}
                            alt={u.displayName}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          u.displayName.slice(0, 1).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-blue-600 truncate">
                            {u.displayName}
                          </span>
                          {u.isVerified && <BadgeCheck className="w-4 h-4 text-blue-600 shrink-0" />}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
                          @{u.username}
                        </p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleToggleFollow(u)}
                      className={`px-3.5 py-2 min-h-[38px] rounded-xl text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        isFollowing
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
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
      )}

      {!loading && showVideos && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Film className="w-4 h-4 text-blue-600" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Short Videos</h2>
            </div>
            <button
              type="button"
              onClick={() => navigate('/videos')}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              Open Video Feed
            </button>
          </div>
          {filteredShortVideos.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {normalizedSearch ? `No short videos matching “${urlQuery}”.` : 'No short videos uploaded yet.'}
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filteredShortVideos.slice(0, 6).map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => navigate('/videos')}
                  className="group relative aspect-[9/14] rounded-xl overflow-hidden bg-slate-950 border border-slate-200 dark:border-slate-800 text-left"
                >
                  {v.thumbnailUrl ? (
                    <img
                      src={v.thumbnailUrl}
                      alt={v.caption}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <video src={v.videoUrl} muted preload="metadata" className="w-full h-full object-cover" />
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/90 to-transparent p-2.5 text-white">
                    <p className="text-xs font-semibold truncate">@{v.authorUsername}</p>
                    <p className="text-[11px] text-slate-200 line-clamp-2">{v.caption}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {!loading && showMovies && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clapperboard className="w-4 h-4 text-blue-600" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Movies &amp; Long Videos
              </h2>
            </div>
            <button
              type="button"
              onClick={() => navigate('/movies')}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              Open Movies Hub
            </button>
          </div>
          {filteredMovies.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {normalizedSearch ? `No movies matching “${urlQuery}”.` : 'No movies uploaded yet.'}
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredMovies.slice(0, 4).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() =>
                    navigate(
                      m.title
                        ? `/movies?q=${encodeURIComponent(m.title)}`
                        : '/movies'
                    )
                  }
                  className="group relative aspect-video rounded-xl overflow-hidden bg-slate-950 border border-slate-200 dark:border-slate-800 text-left"
                >
                  {m.thumbnailUrl ? (
                    <img
                      src={m.thumbnailUrl}
                      alt={m.title || m.caption}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <video src={m.videoUrl} muted preload="metadata" className="w-full h-full object-cover" />
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/90 to-transparent p-3 text-white">
                    <p className="text-xs font-bold truncate">{m.title || m.caption}</p>
                    <p className="text-[11px] text-slate-300 truncate">
                      {m.category || 'Entertainment'} · @{m.authorUsername}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {!loading && showGroups && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Groups &amp; Communities
              </h2>
            </div>
            <button
              type="button"
              onClick={() => navigate('/groups')}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              Open Groups
            </button>
          </div>
          {filteredGroups.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {normalizedSearch ? `No groups matching “${urlQuery}”.` : 'No groups created yet.'}
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredGroups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => navigate('/groups')}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-600 text-left transition-colors"
                >
                  <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{g.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 capitalize">
                    {g.privacy} · {g.membersCount} members
                  </p>
                  {g.description && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 line-clamp-2">
                      {g.description}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {!loading && showPages && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-blue-600" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Creator &amp; Business Pages
              </h2>
            </div>
            <button
              type="button"
              onClick={() => navigate('/groups')}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              Browse Pages
            </button>
          </div>
          {filteredPages.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {normalizedSearch ? `No pages matching “${urlQuery}”.` : 'No creator or business pages created yet.'}
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredPages.map((pg) => (
                <button
                  key={pg.id}
                  type="button"
                  onClick={() => navigate('/groups')}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-600 text-left transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{pg.name}</p>
                    {pg.isVerified && <BadgeCheck className="w-4 h-4 text-blue-600 shrink-0" />}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    <span className="font-mono">@{pg.handle}</span> · {pg.category} ·{' '}
                    {pg.followersCount} followers
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {!loading && showPosts && (
        <section className="space-y-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-white px-1">Public Posts</h2>
          {filteredPosts.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center text-sm text-slate-500 dark:text-slate-400">
              {normalizedSearch ? `No public posts matching “${urlQuery}”.` : 'No public posts available yet.'}
            </div>
          ) : (
            filteredPosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                isLiked={likedIds.has(post.id)}
                isFollowingAuthor={followingIds.has(post.authorId)}
                onToggleFollowAuthor={async (authorId) => {
                  const target = users.find((u) => u.uid === authorId);
                  if (target) {
                    await handleToggleFollow(target);
                  }
                }}
              />
            ))
          )}
        </section>
      )}
    </div>
  );
}
