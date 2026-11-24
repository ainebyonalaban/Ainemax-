import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DocumentSnapshot } from 'firebase/firestore';
import {
  BadgeCheck,
  Bookmark,
  Check,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Disc3,
  Download,
  Film,
  Flag,
  Heart,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Radio,
  RotateCw,
  Search,
  Send,
  Share2,
  SlidersHorizontal,
  Trash2,
  Upload,
  UserCheck,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ReportModal } from '../components/social/ReportModal';
import { UploadHubModal } from '../components/social/UploadHubModal';
import { useAuth } from '../context/AuthContext';
import { VideoPreloadMode, usePreferences } from '../context/PreferencesContext';
import { usePreloadedVideoSrc } from '../hooks/usePreloadedVideoSrc';
import { downloadMediaFile, warmMediaBatch } from '../services/mediaUploadService';
import {
  fetchUserProfileById,
  followUser,
  subscribeUserFollowing,
  unfollowUser,
} from '../services/socialService';
import {
  getLookaheadCount,
  scheduleVideoPreloadQueue,
} from '../services/videoPreloadService';
import {
  addVideoComment,
  deleteShortVideo,
  deleteVideoComment,
  fetchShortVideosPage,
  incrementVideoShare,
  incrementVideoView,
  subscribeUserVideoLikes,
  subscribeUserVideoSaves,
  subscribeVideoComments,
  toggleLikeVideo,
  toggleSaveVideo,
} from '../services/videoService';
import { ShortVideo, VideoComment } from '../types/features';

type FeedTab = 'for_you' | 'following';

interface HeartBurst {
  id: number;
  x: number;
  y: number;
}

function extractTagsFromVideo(video: ShortVideo): string[] {
  const tags = new Set<string>(video.hashtags ?? []);
  const matches = video.caption.match(/#([a-zA-Z0-9_]+)/g) || [];
  matches.forEach((m) => tags.add(m.slice(1).toLowerCase()));
  return Array.from(tags).slice(0, 8);
}

function stopGesturePropagation(e: React.SyntheticEvent) {
  e.stopPropagation();
}

interface ShortVideoSlideProps {
  index: number;
  video: ShortVideo;
  inDecoderWindow: boolean;
  nativePreload: 'auto' | 'metadata' | 'none';
  isLiked: boolean;
  isSaved: boolean;
  isFollowing: boolean;
  hasUserGesture: boolean;
  autoplayEnabled: boolean;
  onUserGesture: () => void;
  onBecomeActive: (index: number) => void;
  onActiveReady: (videoId: string) => void;
  onToggleLike: (forceLikeOnly?: boolean) => void;
  onToggleSave: () => void;
  onToggleFollow: () => void;
  onOpenComments: () => void;
  onShare: () => void;
  onReport: () => void;
  onSelectTag: (tag: string) => void;
  onDelete?: () => void;
}

function ShortVideoSlide({
  index,
  video,
  inDecoderWindow,
  nativePreload,
  isLiked,
  isSaved,
  isFollowing,
  hasUserGesture,
  autoplayEnabled,
  onUserGesture,
  onBecomeActive,
  onActiveReady,
  onToggleLike,
  onToggleSave,
  onToggleFollow,
  onOpenComments,
  onShare,
  onReport,
  onSelectTag,
  onDelete,
}: ShortVideoSlideProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const tapTimeoutRef = useRef<number | null>(null);
  const lastTapRef = useRef<number>(0);
  const resumeTimeRef = useRef<number | null>(null);
  const retryCountRef = useRef<number>(0);

  const [isVisible, setIsVisible] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [firstFrameReady, setFirstFrameReady] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [playbackError, setPlaybackError] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [sharedCopied, setSharedCopied] = useState(false);
  const [likePop, setLikePop] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadPct, setDownloadPct] = useState<number | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [heartBursts, setHeartBursts] = useState<HeartBurst[]>([]);

  const navigate = useNavigate();
  const { firebaseUser, isAdmin } = useAuth();
  const isOwner = firebaseUser?.uid === video.authorId;
  const tags = useMemo(() => extractTagsFromVideo(video), [video]);
  const soundLabel = video.musicTitle?.trim() || `Original Sound — ${video.authorDisplayName}`;

  const { src: resolvedVideoSrc, isBlobCached, promoteToCachedBlob } = usePreloadedVideoSrc(
    inDecoderWindow ? video.videoUrl : undefined,
    isPlaying || hasStarted
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        const visibleNow = entry.isIntersecting && entry.intersectionRatio >= 0.6;
        setIsVisible(visibleNow);
        if (visibleNow) {
          onBecomeActive(index);
        }
      },
      { threshold: [0.2, 0.6, 0.9] }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [index, onBecomeActive]);

  // Attempt playback unmuted when allowed by browser; if browser blocks unmuted autoplay on initial visit,
  // start silently once without exposing any mute toggle, then enable audio on first user gesture.
  const attemptPlayWithPolicy = useCallback(
    async (vid: HTMLVideoElement) => {
      vid.muted = false;
      try {
        await vid.play();
        setIsPlaying(true);
        setHasStarted(true);
        setBuffering(false);
        void incrementVideoView(video.id);
      } catch (err) {
        const name = err instanceof DOMException ? err.name : '';
        if (name === 'NotAllowedError') {
          try {
            vid.muted = true;
            await vid.play();
            setIsPlaying(true);
            setHasStarted(true);
            setBuffering(false);
            void incrementVideoView(video.id);
          } catch {
            setIsPlaying(false);
            setBuffering(false);
          }
        } else {
          setIsPlaying(false);
          setBuffering(false);
        }
      }
    },
    [video.id]
  );

  // When a user gesture happens anywhere in the feed, unmute active playing video automatically
  useEffect(() => {
    const vid = videoRef.current;
    if (hasUserGesture && isVisible && vid && vid.muted) {
      vid.muted = false;
    }
  }, [hasUserGesture, isVisible]);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !inDecoderWindow) return;
    if (isVisible && autoplayEnabled) {
      setPlaybackError(false);
      if (vid.readyState < 3 && !isBlobCached) {
        setBuffering(true);
      }
      void attemptPlayWithPolicy(vid);
    } else {
      vid.pause();
      setIsPlaying(false);
      setBuffering(false);
      if (!isVisible) {
        setHasStarted(false);
        setMoreMenuOpen(false);
        retryCountRef.current = 0;
      }
    }
  }, [isVisible, autoplayEnabled, inDecoderWindow, isBlobCached, attemptPlayWithPolicy]);

  // Stall recovery watchdog
  useEffect(() => {
    if (!isVisible || !buffering) return;
    const watchdog = window.setTimeout(() => {
      const vid = videoRef.current;
      if (!vid || vid.paused || vid.ended) return;

      const savedTime = vid.currentTime;
      const upgraded = promoteToCachedBlob();
      if (upgraded && vid.src !== upgraded) {
        resumeTimeRef.current = savedTime;
        vid.src = upgraded;
        vid.load();
        return;
      }

      if (navigator.onLine && retryCountRef.current < 2) {
        retryCountRef.current += 1;
        void attemptPlayWithPolicy(vid);
      }
    }, 3200);
    return () => window.clearTimeout(watchdog);
  }, [isVisible, buffering, promoteToCachedBlob, attemptPlayWithPolicy]);

  useEffect(() => {
    return () => {
      if (tapTimeoutRef.current) window.clearTimeout(tapTimeoutRef.current);
    };
  }, []);

  const togglePlayPause = () => {
    onUserGesture();
    const vid = videoRef.current;
    if (!vid) return;
    vid.muted = false;
    if (vid.paused) {
      setPlaybackError(false);
      if (vid.readyState < 3 && !isBlobCached) {
        setBuffering(true);
      }
      vid
        .play()
        .then(() => {
          setIsPlaying(true);
          setHasStarted(true);
          setBuffering(false);
          void incrementVideoView(video.id);
        })
        .catch(() => {
          setIsPlaying(false);
          setBuffering(false);
        });
    } else {
      vid.pause();
      setIsPlaying(false);
      setBuffering(false);
    }
  };

  const handleRetryPlayback = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUserGesture();
    const vid = videoRef.current;
    if (!vid) return;
    setPlaybackError(false);
    setBuffering(true);
    resumeTimeRef.current = vid.currentTime || 0;
    vid.muted = false;
    vid.load();
    vid
      .play()
      .then(() => {
        setIsPlaying(true);
        setHasStarted(true);
        setBuffering(false);
      })
      .catch(() => {
        setBuffering(false);
        setPlaybackError(true);
      });
  };

  const handleSurfaceClick = (e: React.MouseEvent<HTMLDivElement>) => {
    onUserGesture();
    if (moreMenuOpen) {
      setMoreMenuOpen(false);
      return;
    }

    const now = Date.now();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (now - lastTapRef.current < 260) {
      if (tapTimeoutRef.current) {
        window.clearTimeout(tapTimeoutRef.current);
        tapTimeoutRef.current = null;
      }
      lastTapRef.current = 0;
      const burstId = now + Math.random();
      setHeartBursts((prev) => [...prev.slice(-4), { id: burstId, x, y }]);
      window.setTimeout(() => {
        setHeartBursts((prev) => prev.filter((b) => b.id !== burstId));
      }, 750);
      if (!isLiked) {
        setLikePop(true);
        window.setTimeout(() => setLikePop(false), 380);
        onToggleLike(true);
      }
    } else {
      lastTapRef.current = now;
      tapTimeoutRef.current = window.setTimeout(() => {
        tapTimeoutRef.current = null;
        togglePlayPause();
      }, 240);
    }
  };

  const triggerLike = () => {
    onUserGesture();
    if (!isLiked) {
      setLikePop(true);
      window.setTimeout(() => setLikePop(false), 380);
    }
    onToggleLike(false);
  };

  const handleDownload = async () => {
    onUserGesture();
    if (downloading) return;
    setDownloading(true);
    setDownloadPct(0);
    setDownloadError(null);
    try {
      await downloadMediaFile(
        video.videoUrl,
        `ainemax_short_${video.authorUsername}_${video.id.slice(0, 6)}`,
        {
          onProgress: (info) => {
            setDownloadPct(info.percent);
          },
        }
      );
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Download failed. Tap to retry.');
      window.setTimeout(() => setDownloadError(null), 4000);
    } finally {
      setDownloading(false);
      setDownloadPct(null);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative snap-start shrink-0 w-full h-[calc(100dvh-56px)] md:h-[100dvh] flex items-center justify-center bg-slate-950 select-none"
    >
      {/* Centered 9:16 Immersive Frame */}
      <div className="relative w-full h-full md:max-w-[460px] md:h-[calc(100dvh-24px)] md:rounded-2xl overflow-hidden bg-black md:border md:border-slate-800 shadow-2xl">
        <div
          onClick={handleSurfaceClick}
          className="relative w-full h-full cursor-pointer flex items-center justify-center"
        >
          {/* Underlying Thumbnail Poster Layer avoids blank black flashes while decoding frame 1 */}
          {video.thumbnailUrl && !firstFrameReady && (
            <img
              src={video.thumbnailUrl}
              alt={video.caption}
              referrerPolicy="no-referrer"
              className="pointer-events-none absolute inset-0 w-full h-full object-contain"
            />
          )}

          {inDecoderWindow && resolvedVideoSrc ? (
            <video
              ref={videoRef}
              src={resolvedVideoSrc}
              poster={video.thumbnailUrl || undefined}
              loop
              playsInline
              preload={nativePreload}
              onLoadedMetadata={() => {
                const vid = videoRef.current;
                if (!vid) return;
                if (resumeTimeRef.current !== null && resumeTimeRef.current > 0) {
                  const target = resumeTimeRef.current;
                  resumeTimeRef.current = null;
                  if (Number.isFinite(vid.duration) && target < vid.duration) {
                    vid.currentTime = target;
                  }
                  if (isVisible) {
                    void attemptPlayWithPolicy(vid);
                  }
                }
              }}
              onLoadedData={() => {
                setFirstFrameReady(true);
                setBuffering(false);
                if (isVisible) onActiveReady(video.id);
              }}
              onCanPlay={() => {
                setFirstFrameReady(true);
                setBuffering(false);
                if (isVisible) onActiveReady(video.id);
              }}
              onCanPlayThrough={() => {
                setFirstFrameReady(true);
                setBuffering(false);
                if (isVisible) onActiveReady(video.id);
              }}
              onWaiting={() => {
                const vid = videoRef.current;
                if (vid && !vid.paused && !vid.ended) {
                  setBuffering(true);
                }
              }}
              onStalled={() => {
                const vid = videoRef.current;
                if (vid && !vid.paused && !vid.ended && vid.readyState < 3) {
                  setBuffering(true);
                }
              }}
              onPlaying={() => {
                setFirstFrameReady(true);
                setBuffering(false);
                setPlaybackError(false);
                setIsPlaying(true);
                setHasStarted(true);
                retryCountRef.current = 0;
                if (isVisible) onActiveReady(video.id);
              }}
              onPause={() => {
                setIsPlaying(false);
                setBuffering(false);
              }}
              onError={() => {
                setBuffering(false);
                setIsPlaying(false);
                if (retryCountRef.current < 1 && navigator.onLine) {
                  retryCountRef.current += 1;
                  const vid = videoRef.current;
                  if (vid) {
                    const upgraded = promoteToCachedBlob();
                    if (upgraded) vid.src = upgraded;
                    vid.load();
                    if (isVisible) void attemptPlayWithPolicy(vid);
                    return;
                  }
                }
                setPlaybackError(true);
              }}
              onTimeUpdate={() => {
                const vid = videoRef.current;
                if (vid && vid.duration > 0) {
                  setBuffering(false);
                  setProgressPct(Math.min(100, (vid.currentTime / vid.duration) * 100));
                }
              }}
              className="w-full h-full object-contain"
            />
          ) : !video.thumbnailUrl ? (
            <div className="w-full h-full bg-slate-950 flex items-center justify-center text-slate-600">
              <Film className="w-10 h-10" aria-hidden="true" />
            </div>
          ) : null}

          {/* Double-tap heart burst */}
          {heartBursts.map((b) => (
            <div
              key={b.id}
              style={{ left: b.x - 36, top: b.y - 36 }}
              className="pointer-events-none absolute z-30 animate-ping"
            >
              <Heart className="w-18 h-18 text-blue-500 fill-blue-500 drop-shadow-lg" />
            </div>
          ))}

          {buffering && !playbackError && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="w-11 h-11 rounded-full bg-slate-950/65 flex items-center justify-center text-white">
                <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
              </div>
            </div>
          )}

          {playbackError && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/55 z-20">
              <button
                type="button"
                onClick={handleRetryPlayback}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg"
              >
                <RotateCw className="w-4 h-4" />
                <span>Connection interrupted — Tap to retry</span>
              </button>
            </div>
          )}

          {!isPlaying && !buffering && !playbackError && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-slate-950/65 text-white flex items-center justify-center">
                <Play className="w-7 h-7 ml-1" aria-hidden="true" />
              </div>
            </div>
          )}
        </div>

        {/* Secondary Top-Right Options (Pause/Play, Report, Delete — NEVER Mute!) */}
        <div
          onTouchStart={stopGesturePropagation}
          onPointerDown={stopGesturePropagation}
          className="absolute top-16 right-3 flex flex-col items-end gap-2 z-20"
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMoreMenuOpen((v) => !v);
            }}
            aria-label="Video options"
            className="w-10 h-10 rounded-full bg-slate-950/55 text-white flex items-center justify-center hover:bg-slate-900/80 transition-colors"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          {moreMenuOpen && (
            <div className="w-40 rounded-xl bg-slate-900/95 border border-slate-700 shadow-xl py-1 text-xs text-white overflow-hidden">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMoreMenuOpen(false);
                  togglePlayPause();
                }}
                className="w-full px-3 py-2.5 flex items-center gap-2 hover:bg-white/10 text-left"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{isPlaying ? 'Pause video' : 'Play video'}</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMoreMenuOpen(false);
                  onReport();
                }}
                className="w-full px-3 py-2.5 flex items-center gap-2 hover:bg-white/10 text-left"
              >
                <Flag className="w-3.5 h-3.5 text-amber-400" />
                <span>Report video</span>
              </button>
              {(isOwner || isAdmin) && onDelete && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMoreMenuOpen(false);
                    onDelete();
                  }}
                  className="w-full px-3 py-2.5 flex items-center gap-2 hover:bg-red-500/20 text-red-400 text-left"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete video</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Download Error Toast */}
        {downloadError && (
          <div className="absolute top-16 left-4 right-16 z-30 px-3 py-2 rounded-xl bg-red-600/95 text-white text-xs font-medium shadow-lg">
            {downloadError}
          </div>
        )}

        {/* Right-Side Action Rail — Exact Top-to-Bottom Order:
            1. Creator Profile + Follow (+)
            2. Like ❤️
            3. Comment 💬
            4. Favorite/Save 🔖
            5. Share ↗️
            6. Download ⬇️
        */}
        <div
          onTouchStart={stopGesturePropagation}
          onPointerDown={stopGesturePropagation}
          className="absolute right-2.5 bottom-11 flex flex-col items-center gap-3 z-20"
        >
          {/* 1. Creator Profile + Follow (+) */}
          <div className="relative mb-1.5">
            <button
              type="button"
              onClick={() => navigate(isOwner ? '/profile' : `/u/${video.authorUsername}`)}
              aria-label={`View @${video.authorUsername} profile`}
              className="w-12 h-12 rounded-full bg-blue-600 text-white font-bold text-sm flex items-center justify-center overflow-hidden border-2 border-white shadow-lg"
            >
              {video.authorAvatarUrl ? (
                <img
                  src={video.authorAvatarUrl}
                  alt={video.authorDisplayName}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                video.authorDisplayName.slice(0, 1).toUpperCase()
              )}
            </button>
            {!isOwner && !isFollowing && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onUserGesture();
                  onToggleFollow();
                }}
                aria-label={`Follow @${video.authorUsername}`}
                className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center border-2 border-slate-950 hover:bg-blue-500 shadow-md"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.75]" />
              </button>
            )}
          </div>

          {/* 2. Like ❤️ */}
          <button
            type="button"
            onClick={triggerLike}
            aria-label={isLiked ? 'Unlike video' : 'Like video'}
            className="flex flex-col items-center gap-0.5 text-white"
          >
            <span
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-transform duration-200 active:scale-90 ${
                likePop ? 'scale-125' : ''
              } ${isLiked ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-950/60 hover:bg-slate-900'}`}
            >
              <Heart className={`w-6 h-6 transition-all ${isLiked ? 'fill-white scale-110' : ''}`} />
            </span>
            <span className="text-[11px] font-semibold tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
              {video.likesCount}
            </span>
          </button>

          {/* 3. Comment 💬 */}
          <button
            type="button"
            onClick={() => {
              onUserGesture();
              onOpenComments();
            }}
            aria-label="Open video comments"
            className="flex flex-col items-center gap-0.5 text-white"
          >
            <span className="w-11 h-11 rounded-full bg-slate-950/60 hover:bg-slate-900 flex items-center justify-center">
              <MessageCircle className="w-6 h-6" />
            </span>
            <span className="text-[11px] font-semibold tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
              {video.commentsCount}
            </span>
          </button>

          {/* 4. Favorite/Save 🔖 */}
          <button
            type="button"
            onClick={() => {
              onUserGesture();
              onToggleSave();
            }}
            aria-label={isSaved ? 'Remove from favorites' : 'Save to favorites'}
            className="flex flex-col items-center gap-0.5 text-white"
          >
            <span
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                isSaved ? 'bg-amber-500 text-white shadow-md' : 'bg-slate-950/60 hover:bg-slate-900'
              }`}
            >
              <Bookmark className={`w-5 h-5 ${isSaved ? 'fill-white' : ''}`} />
            </span>
            <span className="text-[11px] font-semibold drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
              {isSaved ? 'Saved' : 'Save'}
            </span>
          </button>

          {/* 5. Share ↗️ */}
          <button
            type="button"
            onClick={() => {
              onUserGesture();
              onShare();
              setSharedCopied(true);
              window.setTimeout(() => setSharedCopied(false), 1800);
            }}
            aria-label="Share video"
            className="flex flex-col items-center gap-0.5 text-white"
          >
            <span className="w-11 h-11 rounded-full bg-slate-950/60 hover:bg-slate-900 flex items-center justify-center">
              {sharedCopied ? (
                <Check className="w-5 h-5 text-emerald-400" />
              ) : (
                <Share2 className="w-5 h-5" />
              )}
            </span>
            <span className="text-[11px] font-semibold tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
              {sharedCopied ? 'Copied' : video.sharesCount}
            </span>
          </button>

          {/* 6. Download ⬇️ (Preserved, visible, enabled) */}
          <button
            type="button"
            disabled={downloading}
            onClick={() => void handleDownload()}
            aria-label="Download short video"
            title="Download video"
            className="flex flex-col items-center gap-0.5 text-white"
          >
            <span className="w-11 h-11 rounded-full bg-slate-950/60 hover:bg-blue-600 flex items-center justify-center transition-colors">
              {downloading ? (
                <Loader2 className="w-5 h-5 animate-spin text-blue-300" />
              ) : (
                <Download className="w-5 h-5" />
              )}
            </span>
            <span className="text-[11px] font-semibold tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
              {downloading ? (downloadPct !== null ? `${downloadPct}%` : 'Saving') : 'Download'}
            </span>
          </button>
        </div>

        {/* AINEMAX @creator Watermark — Bottom-right safe area without covering controls */}
        <div
          aria-hidden="true"
          className="pointer-events-none select-none absolute right-3 bottom-4 z-15 flex flex-col items-end opacity-75"
        >
          <span className="text-[11px] font-display font-extrabold tracking-wider text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)] leading-none">
            AINEMAX
          </span>
          <span className="text-[10px] font-mono font-medium text-white/95 drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)] mt-0.5">
            @{video.authorUsername}
          </span>
        </div>

        {/* Bottom-Left Creator Info, Caption, Hashtags, Audio Track & Slim Progress */}
        <div
          onTouchStart={stopGesturePropagation}
          onPointerDown={stopGesturePropagation}
          className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent pt-16 pb-3.5 pl-4 pr-20 text-white space-y-1.5 z-10"
        >
          <div className="pointer-events-auto flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => navigate(isOwner ? '/profile' : `/u/${video.authorUsername}`)}
              className="text-sm font-bold hover:underline inline-flex items-center gap-1"
            >
              <span>@{video.authorUsername}</span>
              {video.authorVerified && <BadgeCheck className="w-4 h-4 text-blue-400 shrink-0" />}
            </button>

            {!isOwner && (
              <button
                type="button"
                onClick={() => {
                  onUserGesture();
                  onToggleFollow();
                }}
                className={`px-2.5 py-0.5 rounded-md text-xs font-semibold transition-colors ${
                  isFollowing
                    ? 'bg-white/20 text-white hover:bg-white/30'
                    : 'bg-blue-600 text-white hover:bg-blue-500'
                }`}
              >
                {isFollowing ? (
                  <span className="inline-flex items-center gap-1">
                    <UserCheck className="w-3 h-3" />
                    Following
                  </span>
                ) : (
                  'Follow'
                )}
              </button>
            )}
          </div>

          <p className="pointer-events-auto text-sm text-slate-100 leading-snug line-clamp-2 sm:line-clamp-3">
            {video.caption}
          </p>

          {tags.length > 0 && (
            <div className="pointer-events-auto flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-semibold text-blue-300">
              {tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onSelectTag(tag)}
                  className="hover:text-white hover:underline"
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-slate-200 truncate pr-8">
            <Disc3
              className={`w-4 h-4 text-blue-400 shrink-0 ${isPlaying ? 'animate-spin' : ''}`}
              style={{ animationDuration: '4s' }}
              aria-hidden="true"
            />
            <span className="truncate">{soundLabel}</span>
          </div>

          {/* Slim Playback Progress Bar */}
          <div className="h-0.5 w-full bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-100"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function VideosPage() {
  const { firebaseUser, isVerifiedIdentity, profile, isAdmin } = useAuth();
  const { preferences, updatePreference } = usePreferences();
  const navigate = useNavigate();

  const scrollerRef = useRef<HTMLDivElement>(null);
  const [feedTab, setFeedTab] = useState<FeedTab>('for_you');
  const [searchOpen, setSearchOpen] = useState(false);
  const [preloadPanelOpen, setPreloadPanelOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [readyVideoIds, setReadyVideoIds] = useState<Set<string>>(new Set());
  const [preloadWindowUnlocked, setPreloadWindowUnlocked] = useState(false);
  const [hasUserGesture, setHasUserGesture] = useState(false);

  const [videos, setVideos] = useState<ShortVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursorDoc, setCursorDoc] = useState<DocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());

  const [uploadOpen, setUploadOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<ShortVideo | null>(null);

  const [commentsVideo, setCommentsVideo] = useState<ShortVideo | null>(null);
  const [comments, setComments] = useState<VideoComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  // Track first user interaction so subsequent slides always play with sound cleanly
  useEffect(() => {
    if (hasUserGesture) return;
    const markGesture = () => setHasUserGesture(true);
    window.addEventListener('pointerdown', markGesture, { once: true, passive: true });
    window.addEventListener('keydown', markGesture, { once: true, passive: true });
    return () => {
      window.removeEventListener('pointerdown', markGesture);
      window.removeEventListener('keydown', markGesture);
    };
  }, [hasUserGesture]);

  const loadVideos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchShortVideosPage(10, null);
      setVideos(res.videos);
      setCursorDoc(res.lastDoc);
      setHasMore(res.hasMore);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadVideos();
  }, [loadVideos]);

  useEffect(() => {
    if (!firebaseUser || !isVerifiedIdentity) return;
    const unsubLikes = subscribeUserVideoLikes(firebaseUser.uid, setLikedIds);
    const unsubSaves = subscribeUserVideoSaves(firebaseUser.uid, setSavedIds);
    const unsubFollows = subscribeUserFollowing(firebaseUser.uid, setFollowingIds);
    return () => {
      unsubLikes();
      unsubSaves();
      unsubFollows();
    };
  }, [firebaseUser, isVerifiedIdentity]);

  useEffect(() => {
    if (!commentsVideo) return;
    const unsub = subscribeVideoComments(commentsVideo.id, setComments);
    return () => unsub();
  }, [commentsVideo]);

  const shortVideos = useMemo(() => {
    let list = videos.filter((v) => (v.videoFormat ?? 'short') !== 'long');

    if (feedTab === 'following') {
      list = list.filter((v) => followingIds.has(v.authorId) || v.authorId === firebaseUser?.uid);
    } else {
      list = [...list].sort((a, b) => {
        const aScore =
          (followingIds.has(a.authorId) ? 20 : 0) +
          a.likesCount * 3 +
          a.commentsCount * 4 +
          a.sharesCount * 5 +
          (a.viewsCount ?? 0) * 0.2;
        const bScore =
          (followingIds.has(b.authorId) ? 20 : 0) +
          b.likesCount * 3 +
          b.commentsCount * 4 +
          b.sharesCount * 5 +
          (b.viewsCount ?? 0) * 0.2;
        if (bScore !== aScore) return bScore - aScore;
        const aMs = a.createdAt?.toMillis?.() ?? 0;
        const bMs = b.createdAt?.toMillis?.() ?? 0;
        return bMs - aMs;
      });
    }

    if (activeTag) {
      list = list.filter((v) => extractTagsFromVideo(v).includes(activeTag));
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (v) =>
          v.caption.toLowerCase().includes(q) ||
          v.authorUsername.toLowerCase().includes(q) ||
          v.authorDisplayName.toLowerCase().includes(q) ||
          (v.musicTitle || '').toLowerCase().includes(q) ||
          extractTagsFromVideo(v).some((t) => t.includes(q.replace(/^#/, '')))
      );
    }

    return list;
  }, [videos, feedTab, followingIds, firebaseUser?.uid, activeTag, searchQuery]);

  useEffect(() => {
    if (shortVideos.length === 0) {
      setActiveIndex(0);
    } else if (activeIndex >= shortVideos.length) {
      setActiveIndex(shortVideos.length - 1);
    }
  }, [shortVideos.length, activeIndex]);

  const handleLoadMore = useCallback(async () => {
    if (!cursorDoc || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetchShortVideosPage(12, cursorDoc);
      setVideos((prev) => {
        const seen = new Set(prev.map((v) => v.id));
        return [...prev, ...res.videos.filter((v) => !seen.has(v.id))];
      });
      setCursorDoc(res.lastDoc);
      setHasMore(res.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }, [cursorDoc, loadingMore]);

  const activeVideo = shortVideos[activeIndex];
  const isActiveVideoReady = activeVideo ? readyVideoIds.has(activeVideo.id) : false;

  // Give active slide immediate exclusive network bandwidth; unlock next-video preload as soon as
  // active slide hits onCanPlay/onPlaying OR after a 550ms fallback
  useEffect(() => {
    setPreloadWindowUnlocked(isActiveVideoReady);
    if (isActiveVideoReady || !activeVideo) return;
    const fallbackTimer = window.setTimeout(() => setPreloadWindowUnlocked(true), 550);
    return () => window.clearTimeout(fallbackTimer);
  }, [activeIndex, isActiveVideoReady, activeVideo?.id]);

  const lookaheadCount = getLookaheadCount(preferences.preloadMode, preferences.dataSaverMode);

  useEffect(() => {
    if (shortVideos.length === 0) return;

    if (!preferences.dataSaverMode) {
      warmMediaBatch(
        shortVideos.slice(activeIndex + 1, activeIndex + 6).map((v) => v.thumbnailUrl),
        5
      );
    }

    const autoDownloadEnabled =
      preferences.autoDownloadNextVideos &&
      !preferences.dataSaverMode &&
      preferences.preloadMode !== 'off' &&
      preloadWindowUnlocked;

    // Strictly preload upcoming videos (activeIndex + 1 first, then +2) so we NEVER double-download activeIndex
    const upcomingItems = autoDownloadEnabled
      ? shortVideos
          .slice(activeIndex + 1, activeIndex + 1 + lookaheadCount)
          .map((v) => ({ url: v.videoUrl }))
      : [];

    const cancelPreload = scheduleVideoPreloadQueue(upcomingItems, {
      enabled: autoDownloadEnabled,
      concurrency: 1,
      delayMs: 80,
    });

    if (activeIndex >= Math.max(0, shortVideos.length - 3) && hasMore && !loadingMore) {
      void handleLoadMore();
    }

    return cancelPreload;
  }, [
    activeIndex,
    shortVideos,
    lookaheadCount,
    preloadWindowUnlocked,
    preferences.autoDownloadNextVideos,
    preferences.preloadMode,
    preferences.dataSaverMode,
    hasMore,
    loadingMore,
    handleLoadMore,
  ]);

  const handleBecomeActive = useCallback((idx: number) => {
    setActiveIndex(idx);
  }, []);

  const handleActiveReady = useCallback((videoId: string) => {
    setReadyVideoIds((prev) => {
      if (prev.has(videoId)) return prev;
      const next = new Set(prev);
      next.add(videoId);
      return next;
    });
  }, []);

  const requireAuth = () => {
    if (!firebaseUser) {
      navigate('/auth');
      return false;
    }
    if (!profile?.onboardingComplete) {
      navigate('/onboarding');
      return false;
    }
    return true;
  };

  const scrollSlideBy = (direction: 1 | -1) => {
    setHasUserGesture(true);
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ top: direction * el.clientHeight, behavior: 'smooth' });
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (commentsVideo || uploadOpen || reportTarget || searchOpen || preloadPanelOpen) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        scrollSlideBy(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        scrollSlideBy(-1);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [commentsVideo, uploadOpen, reportTarget, searchOpen, preloadPanelOpen]);

  const handleToggleFollow = async (authorId: string) => {
    if (!requireAuth() || !profile) return;
    if (followingIds.has(authorId)) {
      await unfollowUser(profile.uid, authorId);
    } else {
      const target = await fetchUserProfileById(authorId);
      if (target) await followUser(profile, target);
    }
  };

  const handleToggleLike = (video: ShortVideo, forceLikeOnly = false) => {
    if (!requireAuth() || !firebaseUser) return;
    const currentlyLiked = likedIds.has(video.id);
    if (forceLikeOnly && currentlyLiked) return;
    setVideos((prev) =>
      prev.map((v) =>
        v.id === video.id
          ? { ...v, likesCount: Math.max(0, v.likesCount + (currentlyLiked ? -1 : 1)) }
          : v
      )
    );
    void toggleLikeVideo(video.id, firebaseUser.uid, currentlyLiked, profile, video.authorId);
  };

  const handleToggleSave = (video: ShortVideo) => {
    if (!requireAuth() || !firebaseUser) return;
    const saved = savedIds.has(video.id);
    void toggleSaveVideo(video.id, firebaseUser.uid, saved);
  };

  const handleShareVideo = async (video: ShortVideo) => {
    const shareUrl = `${window.location.origin}/videos`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${video.authorDisplayName} on AINEMAX`,
          text: video.caption,
          url: shareUrl,
        });
      } catch {
        void navigator.clipboard?.writeText(shareUrl);
      }
    } else {
      void navigator.clipboard?.writeText(shareUrl);
    }
    if (firebaseUser) {
      setVideos((prev) =>
        prev.map((v) => (v.id === video.id ? { ...v, sharesCount: v.sharesCount + 1 } : v))
      );
      void incrementVideoShare(video.id);
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireAuth() || !profile || !commentsVideo || !commentText.trim()) return;
    setPostingComment(true);
    try {
      await addVideoComment(profile, commentsVideo.id, commentText, commentsVideo.authorId);
      setCommentText('');
      setVideos((prev) =>
        prev.map((v) =>
          v.id === commentsVideo.id ? { ...v, commentsCount: v.commentsCount + 1 } : v
        )
      );
    } finally {
      setPostingComment(false);
    }
  };

  return (
    <div className="relative w-full h-[calc(100dvh-56px)] md:h-[100dvh] bg-slate-950 text-white overflow-hidden">
      {/* Clean Top Navigation: Following · For You · Search (+ Live/Movies/Post access) */}
      <header className="absolute top-0 inset-x-0 z-30 px-3 sm:px-5 pt-3 pb-2 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => navigate('/live')}
            className="inline-flex items-center gap-1.5 px-2.5 py-2 min-h-[40px] rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold tracking-wide transition-colors"
          >
            <Radio className="w-3.5 h-3.5" aria-hidden="true" />
            <span>LIVE</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/movies')}
            className="inline-flex items-center gap-1.5 px-2.5 py-2 min-h-[40px] rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors"
            title="Switch to AINEMAX Movies"
          >
            <Clapperboard className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
            <span className="hidden sm:inline">Movies</span>
          </button>
        </div>

        <nav aria-label="Short video feeds" className="flex items-center gap-5 text-sm font-bold">
          <button
            type="button"
            onClick={() => {
              setHasUserGesture(true);
              setFeedTab('following');
              setActiveIndex(0);
            }}
            className={`relative py-2 transition-colors ${
              feedTab === 'following' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Following
            {feedTab === 'following' && (
              <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-blue-500" />
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setHasUserGesture(true);
              setFeedTab('for_you');
              setActiveIndex(0);
            }}
            className={`relative py-2 transition-colors ${
              feedTab === 'for_you' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            For You
            {feedTab === 'for_you' && (
              <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-blue-500" />
            )}
          </button>
        </nav>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setSearchOpen((v) => !v);
              setPreloadPanelOpen(false);
            }}
            aria-label="Search short videos"
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
              searchOpen
                ? 'bg-blue-600 text-white'
                : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
          >
            <Search className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setPreloadPanelOpen((v) => !v);
              setSearchOpen(false);
            }}
            aria-label="Video preload and auto-download settings"
            title="Preload & Auto-download"
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
              preloadPanelOpen
                ? 'bg-blue-600 text-white'
                : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (!requireAuth()) return;
              setUploadOpen(true);
            }}
            aria-label="Upload short video"
            className="hidden sm:inline-flex items-center gap-1 px-3 py-2 min-h-[40px] rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
          >
            <Plus className="w-4 h-4" />
            <span>Post</span>
          </button>
        </div>
      </header>

      {/* Preload & Smooth Playback Popover */}
      {preloadPanelOpen && (
        <div className="absolute top-14 right-3 sm:right-5 z-40 w-[calc(100%-24px)] max-w-xs bg-slate-900/95 border border-slate-700 rounded-2xl p-4 shadow-2xl space-y-3.5 text-white">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-blue-300">
              Preload &amp; Smooth Playback
            </h3>
            <button
              type="button"
              onClick={() => setPreloadPanelOpen(false)}
              aria-label="Close preload settings"
              className="p-1 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {preferences.dataSaverMode && (
            <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-400/30 text-xs text-amber-200 space-y-1.5">
              <p>Data Saver mode is pausing background preloads.</p>
              <button
                type="button"
                onClick={() => updatePreference('dataSaverMode', false)}
                className="font-semibold text-amber-100 underline"
              >
                Disable Data Saver for instant playback
              </button>
            </div>
          )}

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-slate-300">Video Preload Window</p>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: 'off', label: 'Off' },
                  { id: 'standard', label: 'Next 2' },
                  { id: 'high', label: 'Next 3' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => updatePreference('preloadMode', opt.id as VideoPreloadMode)}
                  className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                    preferences.preloadMode === opt.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center justify-between gap-3 cursor-pointer pt-1 border-t border-slate-800">
            <div>
              <p className="text-xs font-semibold text-white">Auto-download next videos</p>
              <p className="text-[11px] text-slate-400">
                Buffer upcoming clips sequentially after active playback begins
              </p>
            </div>
            <input
              type="checkbox"
              checked={preferences.autoDownloadNextVideos}
              onChange={(e) => updatePreference('autoDownloadNextVideos', e.target.checked)}
              className="w-4 h-4 rounded border-slate-600 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
          </label>
        </div>
      )}

      {/* Expandable Search & Hashtag Filter */}
      {(searchOpen || activeTag) && (
        <div className="absolute top-14 inset-x-0 z-30 px-4 flex justify-center">
          <div className="w-full max-w-md bg-slate-900/95 border border-slate-700 rounded-2xl p-2.5 flex items-center gap-2 shadow-xl">
            <Search className="w-4 h-4 text-slate-400 ml-1 shrink-0" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search creators, captions, #hashtags, sounds..."
              className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-400 focus:outline-none"
            />
            {activeTag && (
              <button
                type="button"
                onClick={() => setActiveTag(null)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-600/30 text-blue-300 text-xs font-semibold"
              >
                <span>#{activeTag}</span>
                <X className="w-3 h-3" />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setActiveTag(null);
                setSearchOpen(false);
              }}
              aria-label="Close search"
              className="p-1.5 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Desktop Previous / Next Scroll Buttons */}
      <div className="hidden md:flex flex-col gap-2 fixed right-6 top-1/2 -translate-y-1/2 z-30">
        <button
          type="button"
          onClick={() => scrollSlideBy(-1)}
          aria-label="Previous short video"
          className="w-11 h-11 rounded-full bg-slate-900/80 border border-slate-700 text-white flex items-center justify-center hover:bg-slate-800"
        >
          <ChevronUp className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={() => scrollSlideBy(1)}
          aria-label="Next short video"
          className="w-11 h-11 rounded-full bg-slate-900/80 border border-slate-700 text-white flex items-center justify-center hover:bg-slate-800"
        >
          <ChevronDown className="w-5 h-5" />
        </button>
      </div>

      {/* Main Vertical 9:16 Feed */}
      {loading ? (
        <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-300 text-sm">
          <Loader2 className="w-7 h-7 animate-spin text-blue-500" aria-hidden="true" />
          <span>Loading AINEMAX Short Videos...</span>
        </div>
      ) : shortVideos.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-center px-6 space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 text-blue-400 flex items-center justify-center">
            <Film className="w-7 h-7" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-bold text-white">
            {feedTab === 'following'
              ? 'No short videos from creators you follow yet'
              : activeTag || searchQuery
                ? 'No matching short videos found'
                : 'No short videos uploaded yet'}
          </h2>
          <p className="text-sm text-slate-400 max-w-sm">
            {feedTab === 'following'
              ? 'Follow creators in For You or upload your own vertical clip to start your feed.'
              : 'Select a vertical video from your device gallery or files to publish the first short video.'}
          </p>
          <div className="flex items-center gap-2 pt-1">
            {(activeTag || searchQuery || feedTab === 'following') && (
              <button
                type="button"
                onClick={() => {
                  setFeedTab('for_you');
                  setActiveTag(null);
                  setSearchQuery('');
                }}
                className="px-4 py-2.5 min-h-[44px] rounded-xl border border-slate-700 text-sm font-medium text-white hover:bg-slate-900"
              >
                Show For You
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (!requireAuth()) return;
                setUploadOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500"
            >
              <Upload className="w-4 h-4" />
              <span>Upload short video</span>
            </button>
          </div>
        </div>
      ) : (
        <div
          ref={scrollerRef}
          className="h-full w-full overflow-y-auto snap-y snap-mandatory scroll-smooth"
        >
          {shortVideos.map((video, idx) => {
            const windowAhead = Math.max(1, lookaheadCount);
            const inDecoderWindow =
              idx >= activeIndex - 1 && idx <= activeIndex + windowAhead;

            let nativePreload: 'auto' | 'metadata' | 'none' = 'none';
            if (idx === activeIndex) {
              nativePreload = 'auto';
            } else if (
              preloadWindowUnlocked &&
              !preferences.dataSaverMode &&
              preferences.preloadMode !== 'off' &&
              idx === activeIndex + 1
            ) {
              nativePreload = 'auto';
            } else if (inDecoderWindow) {
              nativePreload = 'metadata';
            }

            return (
              <ShortVideoSlide
                key={video.id}
                index={idx}
                video={video}
                inDecoderWindow={inDecoderWindow}
                nativePreload={nativePreload}
                isLiked={likedIds.has(video.id)}
                isSaved={savedIds.has(video.id)}
                isFollowing={followingIds.has(video.authorId)}
                hasUserGesture={hasUserGesture}
                autoplayEnabled={preferences.autoplayVideos}
                onUserGesture={() => setHasUserGesture(true)}
                onBecomeActive={handleBecomeActive}
                onActiveReady={handleActiveReady}
                onToggleLike={(forceLikeOnly) => handleToggleLike(video, forceLikeOnly)}
                onToggleSave={() => handleToggleSave(video)}
                onToggleFollow={() => void handleToggleFollow(video.authorId)}
                onOpenComments={() => setCommentsVideo(video)}
                onShare={() => void handleShareVideo(video)}
                onReport={() => {
                  if (!requireAuth()) return;
                  setReportTarget(video);
                }}
                onSelectTag={(tag) => setActiveTag(tag)}
                onDelete={
                  firebaseUser?.uid === video.authorId || isAdmin
                    ? () => {
                        void deleteShortVideo(video.id, video.authorId).then(() =>
                          setVideos((prev) => prev.filter((v) => v.id !== video.id))
                        );
                      }
                    : undefined
                }
              />
            );
          })}

          {hasMore && (
            <div className="snap-start py-6 flex justify-center bg-slate-950">
              <button
                type="button"
                onClick={() => void handleLoadMore()}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl border border-slate-700 bg-slate-900 text-sm font-medium text-white hover:bg-slate-800"
              >
                {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{loadingMore ? 'Loading more...' : 'Load more short videos'}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {uploadOpen && (
        <UploadHubModal
          initialCategory="short"
          onClose={() => setUploadOpen(false)}
          onSuccess={(cat) => {
            if (cat === 'long') navigate('/movies');
            else if (cat === 'story') navigate('/stories');
            else void loadVideos();
          }}
        />
      )}

      {reportTarget && (
        <ReportModal
          targetType="video"
          targetId={reportTarget.id}
          targetLabel={reportTarget.caption || `Video by @${reportTarget.authorUsername}`}
          onClose={() => setReportTarget(null)}
        />
      )}

      {commentsVideo && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Video comments"
          onClick={() => setCommentsVideo(null)}
          className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md max-h-[82vh] flex flex-col"
          >
            <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold">Comments ({comments.length})</h3>
              <button
                type="button"
                onClick={() => setCommentsVideo(null)}
                aria-label="Close comments"
                className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {comments.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">
                  No comments yet. Be the first to comment!
                </p>
              ) : (
                comments.map((c) => (
                  <div
                    key={c.id}
                    className="bg-slate-50 dark:bg-slate-800/70 rounded-xl p-3 flex items-start justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold">{c.authorDisplayName}</span>
                        {c.authorVerified && <BadgeCheck className="w-3.5 h-3.5 text-blue-600" />}
                        <span className="text-[11px] text-slate-500 font-mono">
                          @{c.authorUsername}
                        </span>
                      </div>
                      <p className="text-sm text-slate-700 dark:text-slate-200 mt-1 break-words">
                        {c.content}
                      </p>
                    </div>
                    {(firebaseUser?.uid === c.authorId || isAdmin) && (
                      <button
                        type="button"
                        onClick={() => void deleteVideoComment(c.id, commentsVideo.id)}
                        aria-label="Delete comment"
                        className="p-1 text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            <form
              onSubmit={handlePostComment}
              className="p-3 border-t border-slate-100 dark:border-slate-800 flex gap-2"
            >
              <input
                type="text"
                maxLength={500}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Write a comment..."
                className="flex-1 h-10 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:bg-white dark:focus:bg-slate-900 focus:border-blue-600 focus:outline-none"
              />
              <button
                type="submit"
                disabled={postingComment || !commentText.trim()}
                aria-label="Send comment"
                className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 disabled:opacity-50"
              >
                {postingComment ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
