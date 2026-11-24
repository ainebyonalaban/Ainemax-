import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Download,
  Eye,
  Loader2,
  MessageCircle,
  Plus,
  Send,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { UploadHubModal } from '../components/social/UploadHubModal';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { usePreloadedVideoSrc } from '../hooks/usePreloadedVideoSrc';
import {
  downloadMediaFile,
  prefetchMediaUrl,
  warmMediaBatch,
} from '../services/mediaUploadService';
import {
  deleteStory,
  fetchActiveStories,
  fetchStoryViewers,
  markStoryViewed,
  sendStoryReply,
  setStoryReaction,
  subscribeStoryReactions,
  subscribeStoryReplies,
} from '../services/storyService';
import { getLookaheadCount, scheduleVideoPreloadQueue } from '../services/videoPreloadService';
import { Story, StoryReaction, StoryReply, StoryView } from '../types/features';

interface StoryGroup {
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorAvatarUrl: string;
  stories: Story[];
}

const STORY_REACTION_EMOJIS = ['❤️', '🔥', '👏', '😂', '😮'] as const;

export function StoriesPage() {
  const { firebaseUser, profile, isAdmin } = useAuth();
  const { preferences } = usePreferences();
  const navigate = useNavigate();

  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);

  // Viewer state
  const [activeGroupIdx, setActiveGroupIdx] = useState<number | null>(null);
  const [activeStoryIdx, setActiveStoryIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [videoBuffering, setVideoBuffering] = useState(false);
  const [videoDurationMs, setVideoDurationMs] = useState<number | null>(null);

  // Reactions, Replies & Viewer List state
  const [reactions, setReactions] = useState<StoryReaction[]>([]);
  const [replies, setReplies] = useState<StoryReply[]>([]);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  const [viewersOpen, setViewersOpen] = useState(false);
  const [viewersLoading, setViewersLoading] = useState(false);
  const [viewersList, setViewersList] = useState<StoryView[]>([]);

  // Upload state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [downloadingStory, setDownloadingStory] = useState(false);
  const [storyDownloadError, setStoryDownloadError] = useState<string | null>(null);

  const loadStories = useCallback(async () => {
    setLoading(true);
    try {
      const active = await fetchActiveStories();
      setStories(active);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStories();
  }, [loadStories]);

  const groups = useMemo<StoryGroup[]>(() => {
    const map = new Map<string, StoryGroup>();
    stories.forEach((s) => {
      const existing = map.get(s.authorId);
      if (existing) {
        existing.stories.push(s);
      } else {
        map.set(s.authorId, {
          authorId: s.authorId,
          authorUsername: s.authorUsername,
          authorDisplayName: s.authorDisplayName,
          authorAvatarUrl: s.authorAvatarUrl,
          stories: [s],
        });
      }
    });
    return Array.from(map.values());
  }, [stories]);

  const currentGroup = activeGroupIdx !== null ? groups[activeGroupIdx] ?? null : null;
  const currentStory = currentGroup ? currentGroup.stories[activeStoryIdx] ?? null : null;
  const isCurrentStoryAuthor = Boolean(
    currentStory && firebaseUser && currentStory.authorId === firebaseUser.uid
  );

  const { src: resolvedStoryVideoSrc } = usePreloadedVideoSrc(
    currentStory?.mediaType === 'video' ? currentStory.mediaUrl : undefined,
    Boolean(currentStory?.mediaType === 'video' && !videoBuffering && !paused)
  );

  const goNextStory = useCallback(() => {
    if (activeGroupIdx === null) return;
    const grp = groups[activeGroupIdx];
    if (!grp) {
      setActiveGroupIdx(null);
      return;
    }
    setViewersOpen(false);
    if (activeStoryIdx + 1 < grp.stories.length) {
      setActiveStoryIdx((i) => i + 1);
      setProgress(0);
    } else if (activeGroupIdx + 1 < groups.length) {
      setActiveGroupIdx((g) => (g !== null ? g + 1 : null));
      setActiveStoryIdx(0);
      setProgress(0);
    } else {
      setActiveGroupIdx(null);
      setActiveStoryIdx(0);
      setProgress(0);
    }
  }, [activeGroupIdx, activeStoryIdx, groups]);

  const goPrevStory = useCallback(() => {
    if (activeGroupIdx === null) return;
    setViewersOpen(false);
    if (activeStoryIdx > 0) {
      setActiveStoryIdx((i) => i - 1);
      setProgress(0);
    } else if (activeGroupIdx > 0) {
      const prevGrp = groups[activeGroupIdx - 1];
      setActiveGroupIdx(activeGroupIdx - 1);
      setActiveStoryIdx(Math.max(0, prevGrp.stories.length - 1));
      setProgress(0);
    }
  }, [activeGroupIdx, activeStoryIdx, groups]);

  // Warm first few story thumbnails
  useEffect(() => {
    if (groups.length > 0 && activeGroupIdx === null) {
      warmMediaBatch(
        groups
          .slice(0, 4)
          .map((g) => g.stories[0]?.mediaUrl)
          .filter((u): u is string => Boolean(u)),
        4
      );
    }
  }, [groups, activeGroupIdx]);

  // Subscribe to reactions & replies when viewing a story
  useEffect(() => {
    if (!currentStory || !firebaseUser) {
      setReactions([]);
      setReplies([]);
      return;
    }
    const unsubReact = subscribeStoryReactions(
      currentStory.id,
      firebaseUser.uid,
      isCurrentStoryAuthor,
      setReactions
    );
    const unsubReply = subscribeStoryReplies(
      currentStory.id,
      firebaseUser.uid,
      isCurrentStoryAuthor,
      setReplies
    );
    return () => {
      unsubReact();
      unsubReply();
    };
  }, [currentStory, firebaseUser, isCurrentStoryAuthor]);

  // Track views, auto-download next story videos/images while watching, and advance timer
  useEffect(() => {
    setVideoBuffering(false);
    setVideoDurationMs(null);
    if (!currentStory) return;

    const upcomingStories: Story[] = [];
    if (currentGroup) {
      for (let offset = 1; offset <= 3; offset += 1) {
        if (currentGroup.stories[activeStoryIdx + offset]) {
          upcomingStories.push(currentGroup.stories[activeStoryIdx + offset]);
        }
      }
      if (activeGroupIdx !== null && activeGroupIdx + 1 < groups.length) {
        const nextGrp = groups[activeGroupIdx + 1];
        if (nextGrp?.stories[0]) upcomingStories.push(nextGrp.stories[0]);
        if (nextGrp?.stories[1]) upcomingStories.push(nextGrp.stories[1]);
      }
    }

    const lookahead = getLookaheadCount(preferences.preloadMode, preferences.dataSaverMode);
    const autoDownloadEnabled =
      preferences.autoDownloadNextVideos &&
      !preferences.dataSaverMode &&
      preferences.preloadMode !== 'off';

    if (!preferences.dataSaverMode) {
      upcomingStories
        .filter((s) => s.mediaType === 'image' && s.mediaUrl)
        .slice(0, 3)
        .forEach((s) => void prefetchMediaUrl(s.mediaUrl));
    }

    const upcomingVideoQueue = autoDownloadEnabled
      ? upcomingStories
          .filter((s) => s.mediaType === 'video' && s.mediaUrl)
          .slice(0, Math.max(1, lookahead))
          .map((s) => ({ url: s.mediaUrl }))
      : [];

    const cancelPreload = scheduleVideoPreloadQueue(upcomingVideoQueue, {
      enabled: autoDownloadEnabled && upcomingVideoQueue.length > 0,
      concurrency: 1,
    });

    if (profile?.onboardingComplete) {
      void markStoryViewed(currentStory.id, profile, currentStory.authorId).then(
        (incremented) => {
          if (incremented) {
            setStories((prev) =>
              prev.map((s) =>
                s.id === currentStory.id ? { ...s, viewsCount: s.viewsCount + 1 } : s
              )
            );
          }
        }
      );
    }

    return cancelPreload;
  }, [
    currentStory?.id,
    currentGroup,
    activeStoryIdx,
    activeGroupIdx,
    groups,
    profile,
    preferences.preloadMode,
    preferences.autoDownloadNextVideos,
    preferences.dataSaverMode,
  ]);

  useEffect(() => {
    if (!currentStory || paused || viewersOpen) return;
    if (currentStory.mediaType === 'video' && videoBuffering) return;
    const durationMs =
      currentStory.mediaType === 'video' ? (videoDurationMs ?? 15000) : 5000;
    const intervalMs = 60;
    const step = (intervalMs / durationMs) * 100;
    const timer = window.setInterval(() => {
      setProgress((prev) => {
        const next = prev + step;
        if (next >= 100) {
          window.clearInterval(timer);
          goNextStory();
          return 100;
        }
        return next;
      });
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [currentStory, paused, viewersOpen, videoBuffering, videoDurationMs, goNextStory]);

  const handleOpenUpload = () => {
    if (!firebaseUser) {
      navigate('/auth');
      return;
    }
    if (!profile?.onboardingComplete) {
      navigate('/onboarding');
      return;
    }
    setUploadOpen(true);
  };

  const handleOpenViewersList = async () => {
    if (!currentStory || !isCurrentStoryAuthor) return;
    setViewersOpen(true);
    setViewersLoading(true);
    try {
      const list = await fetchStoryViewers(currentStory.id, currentStory.authorId);
      setViewersList(list);
    } finally {
      setViewersLoading(false);
    }
  };

  const handleReact = async (emoji: string) => {
    if (!firebaseUser) {
      navigate('/auth');
      return;
    }
    if (!profile || !currentStory) return;
    await setStoryReaction(currentStory.id, profile, emoji, currentStory.authorId);
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) {
      navigate('/auth');
      return;
    }
    if (!profile || !currentStory || !replyText.trim()) return;
    setSendingReply(true);
    try {
      await sendStoryReply(currentStory.id, profile, replyText, currentStory.authorId);
      setReplyText('');
    } finally {
      setSendingReply(false);
    }
  };

  const handleDeleteCurrentStory = async () => {
    if (!currentStory) return;
    const idToDelete = currentStory.id;
    await deleteStory(idToDelete);
    setStories((prev) => prev.filter((s) => s.id !== idToDelete));
    setActiveGroupIdx(null);
  };

  const myReaction = useMemo(
    () => reactions.find((r) => r.userId === firebaseUser?.uid)?.emoji || '',
    [reactions, firebaseUser?.uid]
  );

  return (
    <div className="space-y-5">
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <CircleDot className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">24-Hour Stories</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Share photo, video, and text stories that automatically disappear after 24 hours
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenUpload}
          className="inline-flex items-center gap-2 px-4 py-2 min-h-[40px] rounded-xl bg-blue-600 text-white text-xs sm:text-sm font-medium hover:bg-blue-700 transition-colors whitespace-nowrap"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span>Add Story</span>
        </button>
      </section>

      {loading ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          <span>Loading active stories...</span>
        </div>
      ) : groups.length === 0 ? (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center space-y-3">
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">No active stories right now</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Upload a photo, short video, or create a text story to share with your network for 24
            hours.
          </p>
          <button
            type="button"
            onClick={handleOpenUpload}
            className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            <Upload className="w-4 h-4" />
            <span>Create first story</span>
          </button>
        </section>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {groups.map((grp, idx) => {
            const latest = grp.stories[0];
            return (
              <button
                key={grp.authorId}
                type="button"
                onClick={() => {
                  setActiveGroupIdx(idx);
                  setActiveStoryIdx(0);
                  setProgress(0);
                  setPaused(false);
                }}
                className="group relative aspect-[3/4] rounded-2xl overflow-hidden bg-slate-950 border border-slate-200 dark:border-slate-800 text-left"
              >
                {latest.mediaType === 'text' ? (
                  <div
                    className="w-full h-full p-4 flex items-center justify-center text-center text-white text-sm font-bold"
                    style={{
                      background:
                        latest.backgroundColor || 'linear-gradient(135deg, #2563eb 0%, #0f172a 100%)',
                    }}
                  >
                    <span className="line-clamp-5">{latest.caption}</span>
                  </div>
                ) : latest.mediaType === 'image' ? (
                  <img
                    src={latest.mediaUrl}
                    alt={`${grp.authorDisplayName} story`}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                ) : (
                  <video
                    src={latest.mediaUrl}
                    muted
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-cover"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-transparent to-slate-950/35 p-3 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <div className="w-9 h-9 rounded-full ring-2 ring-blue-500 bg-blue-600 text-white font-bold text-xs flex items-center justify-center overflow-hidden">
                      {grp.authorAvatarUrl ? (
                        <img
                          src={grp.authorAvatarUrl}
                          alt={grp.authorDisplayName}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        grp.authorDisplayName.slice(0, 1).toUpperCase()
                      )}
                    </div>
                    <span className="text-[11px] font-medium text-white/90 tabular-nums">
                      {grp.stories.length} {grp.stories.length === 1 ? 'clip' : 'clips'}
                    </span>
                  </div>

                  <div className="text-white">
                    <p className="text-xs font-bold truncate">{grp.authorDisplayName}</p>
                    <p className="text-[11px] text-slate-300 font-mono truncate">
                      @{grp.authorUsername}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Fullscreen Story Viewer */}
      {currentGroup && currentStory && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Story viewer"
          className="fixed inset-0 z-50 bg-slate-950 flex items-center justify-center p-0 sm:p-4"
        >
          <div className="relative w-full max-w-md h-full sm:h-[88vh] sm:rounded-2xl overflow-hidden bg-slate-900 flex flex-col justify-between">
            {/* Progress Bars & Header */}
            <div className="relative z-20 p-3.5 bg-gradient-to-b from-slate-950/85 to-transparent space-y-3">
              <div className="flex items-center gap-1.5">
                {currentGroup.stories.map((st, sIdx) => (
                  <div key={st.id} className="h-1 flex-1 rounded-full bg-white/30 overflow-hidden">
                    <div
                      className="h-full bg-white transition-all duration-75"
                      style={{
                        width:
                          sIdx < activeStoryIdx
                            ? '100%'
                            : sIdx === activeStoryIdx
                              ? `${progress}%`
                              : '0%',
                      }}
                    />
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between gap-2 text-white">
                <button
                  type="button"
                  onClick={() => {
                    setActiveGroupIdx(null);
                    navigate(`/u/${currentGroup.authorUsername}`);
                  }}
                  className="flex items-center gap-2.5 min-w-0 text-left"
                >
                  <div className="w-9 h-9 rounded-full bg-blue-600 font-bold text-xs flex items-center justify-center overflow-hidden shrink-0">
                    {currentGroup.authorAvatarUrl ? (
                      <img
                        src={currentGroup.authorAvatarUrl}
                        alt={currentGroup.authorDisplayName}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      currentGroup.authorDisplayName.slice(0, 1).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">{currentGroup.authorDisplayName}</p>
                    <p className="text-[11px] text-slate-300 font-mono truncate">
                      @{currentGroup.authorUsername}
                    </p>
                  </div>
                </button>

                <div className="flex items-center gap-1.5 shrink-0">
                  {currentStory.mediaType !== 'text' && (
                    <button
                      type="button"
                      disabled={downloadingStory}
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (downloadingStory) return;
                        setDownloadingStory(true);
                        setStoryDownloadError(null);
                        try {
                          await downloadMediaFile(
                            currentStory.mediaUrl,
                            `ainemax_story_${currentGroup.authorUsername}_${currentStory.id.slice(0, 6)}`
                          );
                        } catch (err) {
                          setStoryDownloadError(
                            err instanceof Error ? err.message : 'Unable to download story.'
                          );
                        } finally {
                          setDownloadingStory(false);
                        }
                      }}
                      aria-label="Download story"
                      title="Download story"
                      className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center"
                    >
                      {downloadingStory ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                    </button>
                  )}
                  {(isCurrentStoryAuthor || isAdmin) && (
                    <button
                      type="button"
                      onClick={() => void handleDeleteCurrentStory()}
                      aria-label="Delete story"
                      className="w-9 h-9 rounded-full bg-white/15 hover:bg-red-600 flex items-center justify-center"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setStoryDownloadError(null);
                      setActiveGroupIdx(null);
                    }}
                    aria-label="Close story viewer"
                    className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {storyDownloadError && (
                <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-red-600/90 text-white text-xs">
                  <span>{storyDownloadError}</span>
                  <button
                    type="button"
                    onClick={() => setStoryDownloadError(null)}
                    aria-label="Dismiss download error"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Media / Text Story Canvas */}
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950">
              {currentStory.mediaType === 'text' ? (
                <div
                  className="w-full h-full px-8 flex items-center justify-center text-center text-white text-2xl font-bold leading-snug"
                  style={{
                    background:
                      currentStory.backgroundColor ||
                      'linear-gradient(135deg, #2563eb 0%, #0f172a 100%)',
                  }}
                >
                  {currentStory.caption}
                </div>
              ) : currentStory.mediaType === 'image' ? (
                <img
                  src={currentStory.mediaUrl}
                  alt={currentStory.caption || 'Story photo'}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain"
                />
              ) : (
                <>
                  <video
                    src={resolvedStoryVideoSrc || currentStory.mediaUrl}
                    autoPlay
                    playsInline
                    preload="auto"
                    controls={false}
                    onLoadedMetadata={(e) => {
                      const d = e.currentTarget.duration;
                      if (Number.isFinite(d) && d > 1) {
                        setVideoDurationMs(Math.min(60000, Math.max(3000, Math.round(d * 1000))));
                      }
                    }}
                    onWaiting={() => setVideoBuffering(true)}
                    onStalled={() => setVideoBuffering(true)}
                    onCanPlay={() => setVideoBuffering(false)}
                    onPlaying={() => setVideoBuffering(false)}
                    onEnded={() => goNextStory()}
                    className="w-full h-full object-contain"
                  />
                  {videoBuffering && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <div className="w-12 h-12 rounded-full bg-slate-950/70 text-white flex items-center justify-center">
                        <Loader2 className="w-6 h-6 animate-spin" aria-hidden="true" />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Tap Navigation Overlay */}
            <div className="absolute inset-y-24 inset-x-0 z-10 flex">
              <button
                type="button"
                onClick={goPrevStory}
                aria-label="Previous story"
                className="w-1/3 h-full flex items-center justify-start pl-2 text-white/70 hover:text-white"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                type="button"
                onClick={goNextStory}
                aria-label="Next story"
                className="w-2/3 h-full flex items-center justify-end pr-2 text-white/70 hover:text-white"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </div>

            {/* Bottom Caption, Viewer List Button, Reactions & Replies */}
            <div className="relative z-20 p-3.5 bg-gradient-to-t from-black/95 via-black/75 to-transparent text-white space-y-2.5">
              {currentStory.mediaType !== 'text' && currentStory.caption && (
                <p className="text-sm leading-relaxed">{currentStory.caption}</p>
              )}

              {/* Author View: Reactions & Replies summary + Viewer List Trigger */}
              {isCurrentStoryAuthor ? (
                <div className="space-y-2">
                  {replies.length > 0 && (
                    <div className="max-h-24 overflow-y-auto space-y-1 bg-black/45 rounded-xl p-2 text-xs">
                      {replies.map((r) => (
                        <div key={r.id}>
                          <span className="font-bold text-blue-300 mr-1.5">
                            {r.authorDisplayName}
                          </span>
                          <span>{r.content}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {reactions.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-200">
                      {reactions.map((rx) => (
                        <span key={rx.id} className="bg-white/15 px-2 py-0.5 rounded-lg">
                          {rx.emoji} {rx.displayName || rx.username}
                        </span>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => void handleOpenViewersList()}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-semibold tabular-nums"
                  >
                    <Eye className="w-4 h-4" aria-hidden="true" />
                    <span>Seen by {currentStory.viewsCount}</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Recent viewer sent replies */}
                  {replies.length > 0 && (
                    <div className="text-xs text-blue-200 bg-black/45 rounded-xl px-3 py-1.5">
                      You replied: {replies[replies.length - 1].content}
                    </div>
                  )}

                  {/* Quick Reaction Emojis */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {STORY_REACTION_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => void handleReact(emoji)}
                          className={`w-9 h-9 rounded-full text-base flex items-center justify-center transition-transform active:scale-90 ${
                            myReaction === emoji
                              ? 'bg-blue-600 ring-2 ring-white'
                              : 'bg-white/15 hover:bg-white/25'
                          }`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs text-slate-300 tabular-nums">
                      <Eye className="w-3.5 h-3.5" />
                      {currentStory.viewsCount}
                    </span>
                  </div>

                  {/* Story Reply Input */}
                  <form onSubmit={handleSendReply} className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <MessageCircle className="w-4 h-4 text-slate-300 absolute left-3 top-3 pointer-events-none" />
                      <input
                        type="text"
                        maxLength={400}
                        value={replyText}
                        onFocus={() => setPaused(true)}
                        onBlur={() => setPaused(false)}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder={`Reply to ${currentGroup.authorDisplayName}...`}
                        className="w-full h-10 pl-9 pr-3 rounded-full bg-white/15 border border-white/20 text-sm text-white placeholder:text-slate-300 focus:bg-black/60 focus:border-blue-400 focus:outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={sendingReply || !replyText.trim()}
                      aria-label="Send story reply"
                      className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-500 flex items-center justify-center disabled:opacity-50"
                    >
                      {sendingReply ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </button>
                  </form>
                </div>
              )}
            </div>

            {/* Viewers List Drawer (Author Only) */}
            {viewersOpen && isCurrentStoryAuthor && (
              <div
                onClick={() => setViewersOpen(false)}
                className="absolute inset-0 z-30 bg-black/65 flex items-end"
              >
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-t-3xl p-4 max-h-[60%] flex flex-col space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Story Viewers ({currentStory.viewsCount})
                    </h4>
                    <button
                      type="button"
                      onClick={() => setViewersOpen(false)}
                      aria-label="Close viewers list"
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-2">
                    {viewersLoading ? (
                      <div className="py-6 flex justify-center">
                        <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                      </div>
                    ) : viewersList.length === 0 ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-6">
                        No recorded viewer details yet.
                      </p>
                    ) : (
                      viewersList.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => {
                            setViewersOpen(false);
                            setActiveGroupIdx(null);
                            if (v.viewerUsername) navigate(`/u/${v.viewerUsername}`);
                          }}
                          className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-left"
                        >
                          <div className="w-9 h-9 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center overflow-hidden shrink-0">
                            {v.viewerAvatarUrl ? (
                              <img
                                src={v.viewerAvatarUrl}
                                alt={v.viewerDisplayName || 'Viewer'}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              (v.viewerDisplayName || v.viewerUsername || 'U')
                                .slice(0, 1)
                                .toUpperCase()
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                              {v.viewerDisplayName || 'AINEMAX User'}
                            </p>
                            {v.viewerUsername && (
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                                @{v.viewerUsername}
                              </p>
                            )}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Upload Story via Unified UploadHubModal */}
      {uploadOpen && (
        <UploadHubModal
          initialCategory="story"
          onClose={() => setUploadOpen(false)}
          onSuccess={(cat) => {
            if (cat === 'short') navigate('/videos');
            else if (cat === 'long') navigate('/movies');
            else void loadStories();
          }}
        />
      )}
    </div>
  );
}
