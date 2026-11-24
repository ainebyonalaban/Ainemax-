import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BadgeCheck,
  Bookmark,
  Check,
  Clapperboard,
  Clock,
  Download,
  Flag,
  Heart,
  Loader2,
  Maximize,
  MessageCircle,
  Minimize,
  Pause,
  Play,
  Plus,
  RotateCw,
  Search,
  Send,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  TrendingUp,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ReportModal } from '../components/social/ReportModal';
import { MOVIE_GENRES, UploadHubModal } from '../components/social/UploadHubModal';
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
  getVideoPreloadStatus,
  scheduleVideoPreloadQueue,
  subscribeVideoPreloadState,
} from '../services/videoPreloadService';
import {
  WatchProgressEntry,
  addVideoComment,
  deleteShortVideo,
  deleteVideoComment,
  fetchShortVideosPage,
  getWatchProgressMap,
  incrementVideoShare,
  incrementVideoView,
  saveWatchProgress,
  subscribeUserVideoLikes,
  subscribeUserVideoSaves,
  subscribeVideoComments,
  toggleLikeVideo,
  toggleSaveVideo,
} from '../services/videoService';
import { ShortVideo, VideoComment } from '../types/features';

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '0:00';
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const rem = Math.round(sec % 60);
  if (hrs > 0) {
    return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${rem < 10 ? '0' : ''}${rem}`;
  }
  return `${mins}:${rem < 10 ? '0' : ''}${rem}`;
}

interface MovieCardProps {
  movie: ShortVideo;
  progress?: WatchProgressEntry;
  onPlay: (movie: ShortVideo) => void;
  onDownload: (movie: ShortVideo) => void;
  downloading: boolean;
  downloadPct?: number | null;
}

function MovieCard({
  movie,
  progress,
  onPlay,
  onDownload,
  downloading,
  downloadPct = null,
}: MovieCardProps) {
  const pct =
    progress && progress.durationSec > 0
      ? Math.min(98, Math.round((progress.currentTimeSec / progress.durationSec) * 100))
      : 0;
  const displayTitle = movie.title || movie.caption;

  return (
    <article className="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
      {/* Landscape 16:9 Preview */}
      <div className="relative aspect-video bg-slate-950 overflow-hidden">
        {movie.thumbnailUrl ? (
          <img
            src={movie.thumbnailUrl}
            alt={displayTitle}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
          />
        ) : (
          <video
            src={movie.videoUrl}
            muted
            playsInline
            preload="metadata"
            className="w-full h-full object-cover"
          />
        )}

        <button
          type="button"
          onClick={() => onPlay(movie)}
          aria-label={`Play ${displayTitle}`}
          className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-transparent to-slate-950/20 flex items-center justify-center"
        >
          <span className="w-12 h-12 rounded-full bg-blue-600/95 text-white flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
            <Play className="w-5 h-5 ml-0.5 fill-white" aria-hidden="true" />
          </span>
        </button>

        {/* Top-left Genre & Top-right Quality + Duration */}
        <div className="pointer-events-none absolute top-2.5 left-2.5 text-[11px] font-semibold text-white bg-slate-950/70 px-2 py-0.5 rounded-md">
          {movie.category || 'HD Film'}
        </div>

        <div className="pointer-events-none absolute bottom-2.5 right-2.5 flex items-center gap-1.5">
          <span className="px-2 py-0.5 rounded-md bg-blue-600 text-white text-[10px] font-bold">
            HD
          </span>
          {movie.durationSec > 0 && (
            <span className="px-2 py-0.5 rounded-md bg-slate-950/80 text-white text-[11px] font-mono tabular-nums inline-flex items-center gap-1">
              <Clock className="w-3 h-3" aria-hidden="true" />
              {formatDuration(movie.durationSec)}
            </span>
          )}
        </div>

        {pct > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-white/30">
            <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>

      <div className="p-3.5 flex-1 flex flex-col justify-between gap-2.5">
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => onPlay(movie)}
            className="text-left text-sm font-bold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 line-clamp-2 leading-snug"
          >
            {displayTitle}
          </button>
          <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{movie.caption}</p>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-1.5 min-w-0 text-xs text-slate-600 dark:text-slate-300">
            <span className="font-medium truncate">{movie.authorDisplayName}</span>
            {movie.authorVerified && <BadgeCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
            <span className="text-slate-400">·</span>
            <span className="tabular-nums text-slate-500 dark:text-slate-400">{movie.likesCount} likes</span>
          </div>

          <button
            type="button"
            disabled={downloading}
            onClick={() => onDownload(movie)}
            aria-label={`Download ${displayTitle}`}
            title="Download movie"
            className="min-w-[36px] h-9 px-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-blue-950/60 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-200 flex items-center justify-center gap-1 shrink-0 transition-colors"
          >
            {downloading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {downloadPct !== null && (
                  <span className="text-[10px] font-mono tabular-nums">{downloadPct}%</span>
                )}
              </>
            ) : (
              <Download className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </article>
  );
}

interface MoviePlayerModalProps {
  movie: ShortVideo;
  allMovies: ShortVideo[];
  isLiked: boolean;
  isSaved: boolean;
  isFollowing: boolean;
  isOwnerOrAdmin: boolean;
  initialTimeSec?: number;
  onClose: () => void;
  onSelectMovie: (m: ShortVideo) => void;
  onToggleLike: () => void;
  onToggleSave: () => void;
  onToggleFollow: () => void;
  onShare: () => void;
  onDownload: () => void;
  downloading: boolean;
  downloadPct?: number | null;
  onReport: () => void;
  onDelete?: () => void;
  onProgressUpdate: (videoId: string, timeSec: number, durationSec: number) => void;
}

function MoviePlayerModal({
  movie,
  allMovies,
  isLiked,
  isSaved,
  isFollowing,
  isOwnerOrAdmin,
  initialTimeSec = 0,
  onClose,
  onSelectMovie,
  onToggleLike,
  onToggleSave,
  onToggleFollow,
  onShare,
  onDownload,
  downloading,
  downloadPct = null,
  onReport,
  onDelete,
  onProgressUpdate,
}: MoviePlayerModalProps) {
  const { firebaseUser, profile, isAdmin } = useAuth();
  const { preferences, updatePreference } = usePreferences();
  const navigate = useNavigate();

  const playerShellRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const initialResumeRef = useRef<number>(initialTimeSec);
  const lastProgressSyncRef = useRef<number>(0);
  const retryCountRef = useRef<number>(0);
  const resumeTimeRef = useRef<number | null>(null);

  const [playing, setPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [playbackError, setPlaybackError] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(initialTimeSec);
  const [duration, setDuration] = useState(movie.durationSec || 0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [qualityLabel, setQualityLabel] = useState<'Auto' | 'Source HD'>('Auto');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sharedCopied, setSharedCopied] = useState(false);
  const [upNextCountdown, setUpNextCountdown] = useState<number | null>(null);
  const [, setPreloadTick] = useState(0);

  const [comments, setComments] = useState<VideoComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  const isOwner = firebaseUser?.uid === movie.authorId;

  const { src: resolvedMovieSrc, isBlobCached, promoteToCachedBlob } = usePreloadedVideoSrc(
    movie.videoUrl,
    playing || hasStarted
  );

  useEffect(() => {
    return subscribeVideoPreloadState(() => setPreloadTick((t) => t + 1));
  }, []);

  useEffect(() => {
    void incrementVideoView(movie.id);
    const unsub = subscribeVideoComments(movie.id, setComments);
    return () => unsub();
  }, [movie.id]);

  // Keep initialResumeRef synced strictly when switching movies (never on timeupdate!)
  useEffect(() => {
    initialResumeRef.current = initialTimeSec;
    lastProgressSyncRef.current = 0;
    retryCountRef.current = 0;
    setCurrentTime(initialTimeSec);
    setDuration(movie.durationSec || 0);
    setPlaying(false);
    setHasStarted(false);
    setBuffering(false);
    setPlaybackError(false);
    setUpNextCountdown(null);
  }, [movie.id]);

  // Setup playback strictly per movie.id so watchProgress updates never pause the video
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.playbackRate = playbackRate;

    const handleLoaded = () => {
      const targetResume = resumeTimeRef.current ?? initialResumeRef.current;
      resumeTimeRef.current = null;
      if (Number.isFinite(vid.duration) && vid.duration > 0) {
        setDuration(vid.duration);
        if (targetResume > 2 && targetResume < vid.duration - 2) {
          vid.currentTime = targetResume;
        }
      }
      vid
        .play()
        .then(() => {
          setPlaying(true);
          setHasStarted(true);
          setBuffering(false);
        })
        .catch(() => {
          setPlaying(false);
          setBuffering(false);
        });
    };

    if (vid.readyState >= 1) {
      handleLoaded();
    } else {
      vid.addEventListener('loadedmetadata', handleLoaded);
      return () => vid.removeEventListener('loadedmetadata', handleLoaded);
    }
  }, [movie.id]);

  // Apply playbackRate live without interrupting playback
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Flush final watch progress when modal closes or movie switches
  useEffect(() => {
    const activeId = movie.id;
    return () => {
      const vid = videoRef.current;
      if (vid && Number.isFinite(vid.duration) && vid.duration > 0) {
        onProgressUpdate(activeId, vid.currentTime, vid.duration);
      }
    };
  }, [movie.id, onProgressUpdate]);

  // Stall recovery watchdog during playback
  useEffect(() => {
    if (!buffering || playbackError) return;
    const watchdog = window.setTimeout(() => {
      const vid = videoRef.current;
      if (!vid || vid.paused || vid.ended) return;

      const saved = vid.currentTime;
      const upgraded = promoteToCachedBlob();
      if (upgraded && vid.src !== upgraded) {
        resumeTimeRef.current = saved;
        vid.src = upgraded;
        vid.load();
        return;
      }

      if (navigator.onLine && retryCountRef.current < 2) {
        retryCountRef.current += 1;
        vid.play().catch(() => undefined);
      }
    }, 3800);
    return () => window.clearTimeout(watchdog);
  }, [buffering, playbackError, promoteToCachedBlob]);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const relatedMovies = useMemo(() => {
    return allMovies
      .filter((m) => m.id !== movie.id)
      .sort((a, b) => {
        const aSameCat = a.category && movie.category && a.category === movie.category ? 1 : 0;
        const bSameCat = b.category && movie.category && b.category === movie.category ? 1 : 0;
        if (bSameCat !== aSameCat) return bSameCat - aSameCat;
        return b.likesCount - a.likesCount;
      })
      .slice(0, 6);
  }, [allMovies, movie]);

  // Background preload & auto-download upcoming related movies while watching
  const lookaheadCount = getLookaheadCount(preferences.preloadMode, preferences.dataSaverMode);

  useEffect(() => {
    const autoDownloadEnabled =
      preferences.autoDownloadNextVideos &&
      !preferences.dataSaverMode &&
      preferences.preloadMode !== 'off';

    if (!autoDownloadEnabled || relatedMovies.length === 0) return;

    const queue = relatedMovies
      .slice(0, Math.max(1, lookaheadCount))
      .map((rel) => ({ url: rel.videoUrl, maxFullBytes: 40 * 1024 * 1024 }));

    return scheduleVideoPreloadQueue(queue, {
      enabled: true,
      concurrency: 1,
    });
  }, [
    relatedMovies,
    lookaheadCount,
    preferences.autoDownloadNextVideos,
    preferences.preloadMode,
    preferences.dataSaverMode,
  ]);

  // Up-Next countdown after movie ends
  useEffect(() => {
    if (upNextCountdown === null) return;
    const nextMovie = relatedMovies[0];
    if (!nextMovie) {
      setUpNextCountdown(null);
      return;
    }
    if (upNextCountdown <= 0) {
      setUpNextCountdown(null);
      onSelectMovie(nextMovie);
      return;
    }
    const timer = window.setTimeout(() => {
      setUpNextCountdown((c) => (c !== null ? c - 1 : null));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [upNextCountdown, relatedMovies, onSelectMovie]);

  const togglePlay = () => {
    const vid = videoRef.current;
    if (!vid) return;
    setUpNextCountdown(null);
    if (vid.paused) {
      setPlaybackError(false);
      if (vid.readyState < 3 && !isBlobCached) setBuffering(true);
      vid
        .play()
        .then(() => {
          setPlaying(true);
          setHasStarted(true);
          setBuffering(false);
        })
        .catch(() => {
          setPlaying(false);
          setBuffering(false);
        });
    } else {
      vid.pause();
      setPlaying(false);
      setBuffering(false);
      if (Number.isFinite(vid.duration) && vid.duration > 0) {
        onProgressUpdate(movie.id, vid.currentTime, vid.duration);
      }
    }
  };

  const handleRetryMovie = () => {
    const vid = videoRef.current;
    if (!vid) return;
    setPlaybackError(false);
    setBuffering(true);
    resumeTimeRef.current = vid.currentTime || 0;
    vid.load();
    vid
      .play()
      .then(() => {
        setPlaying(true);
        setHasStarted(true);
        setBuffering(false);
      })
      .catch(() => {
        setBuffering(false);
        setPlaybackError(true);
      });
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = Number(e.target.value);
    const vid = videoRef.current;
    if (!vid || !Number.isFinite(next)) return;
    vid.currentTime = next;
    setCurrentTime(next);
    setUpNextCountdown(null);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    const vid = videoRef.current;
    setVolume(val);
    setMuted(val === 0);
    if (vid) {
      vid.volume = val;
      vid.muted = val === 0;
    }
  };

  const toggleMute = () => {
    const vid = videoRef.current;
    const next = !muted;
    setMuted(next);
    if (vid) vid.muted = next;
  };

  const changeSpeed = (rate: number) => {
    setPlaybackRate(rate);
  };

  const toggleFullscreen = async () => {
    const shell = playerShellRef.current;
    if (!shell) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (shell.requestFullscreen) {
        await shell.requestFullscreen();
      } else {
        const vid = videoRef.current as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
        vid?.webkitEnterFullscreen?.();
      }
    } catch {
      // Ignore fullscreen denial
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) {
      navigate('/auth');
      return;
    }
    if (!profile || !commentText.trim()) return;
    setPostingComment(true);
    try {
      await addVideoComment(profile, movie.id, commentText, movie.authorId);
      setCommentText('');
    } finally {
      setPostingComment(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={movie.title || movie.caption}
      className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-xs overflow-y-auto p-0 sm:p-4 lg:p-6"
    >
      <div className="max-w-6xl mx-auto bg-white dark:bg-slate-900 sm:rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xl">
        {/* Top Modal Header */}
        <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Clapperboard className="w-5 h-5 text-blue-400 shrink-0" />
            <h2 className="text-sm sm:text-base font-bold truncate">
              {movie.title || movie.caption}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close movie player"
            className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Custom Landscape Video Player */}
        <div
          ref={playerShellRef}
          className="relative aspect-video bg-black flex flex-col justify-end group"
        >
          <video
            ref={videoRef}
            src={resolvedMovieSrc || movie.videoUrl}
            poster={movie.thumbnailUrl || undefined}
            preload="auto"
            playsInline
            onClick={togglePlay}
            onLoadedData={() => setBuffering(false)}
            onCanPlay={() => setBuffering(false)}
            onCanPlayThrough={() => setBuffering(false)}
            onWaiting={() => {
              const vid = videoRef.current;
              if (vid && !vid.paused && !vid.ended) setBuffering(true);
            }}
            onStalled={() => {
              const vid = videoRef.current;
              if (vid && !vid.paused && !vid.ended && vid.readyState < 3) setBuffering(true);
            }}
            onPlaying={() => {
              setBuffering(false);
              setPlaybackError(false);
              setPlaying(true);
              setHasStarted(true);
              retryCountRef.current = 0;
            }}
            onPause={() => {
              setPlaying(false);
              setBuffering(false);
            }}
            onError={() => {
              setBuffering(false);
              setPlaying(false);
              if (retryCountRef.current < 1 && navigator.onLine) {
                retryCountRef.current += 1;
                handleRetryMovie();
                return;
              }
              setPlaybackError(true);
            }}
            onTimeUpdate={() => {
              const vid = videoRef.current;
              if (!vid) return;
              setBuffering(false);
              setCurrentTime(vid.currentTime);
              if (Number.isFinite(vid.duration) && vid.duration > 0) {
                setDuration(vid.duration);
                const now = Date.now();
                if (now - lastProgressSyncRef.current >= 2500) {
                  lastProgressSyncRef.current = now;
                  onProgressUpdate(movie.id, vid.currentTime, vid.duration);
                }
              }
            }}
            onEnded={() => {
              setPlaying(false);
              setBuffering(false);
              if (preferences.autoPlayNextMovie && relatedMovies.length > 0) {
                setUpNextCountdown(5);
              }
            }}
            className="w-full h-full object-contain cursor-pointer"
          />

          {/* Buffering Spinner */}
          {buffering && !playbackError && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="w-14 h-14 rounded-full bg-slate-950/70 text-white flex items-center justify-center">
                <Loader2 className="w-7 h-7 animate-spin" aria-hidden="true" />
              </div>
            </div>
          )}

          {/* Error Retry Overlay */}
          {playbackError && (
            <div className="absolute inset-0 bg-black/65 flex items-center justify-center z-20">
              <button
                type="button"
                onClick={handleRetryMovie}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold shadow-lg"
              >
                <RotateCw className="w-4 h-4" />
                <span>Stream interrupted — Tap to retry</span>
              </button>
            </div>
          )}

          {/* Up Next Autoplay Overlay */}
          {upNextCountdown !== null && relatedMovies[0] && (
            <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center gap-3 p-4 text-center z-20">
              <p className="text-xs font-bold uppercase tracking-wider text-blue-300">
                Up Next in {upNextCountdown}s
              </p>
              <p className="text-base font-bold text-white max-w-md line-clamp-2">
                {relatedMovies[0].title || relatedMovies[0].caption}
              </p>
              <div className="flex items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setUpNextCountdown(null);
                    onSelectMovie(relatedMovies[0]);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>Play Now</span>
                </button>
                <button
                  type="button"
                  onClick={() => setUpNextCountdown(null)}
                  className="px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Big Center Play Indicator when Paused */}
          {!playing && !buffering && !playbackError && upNextCountdown === null && (
            <button
              type="button"
              onClick={togglePlay}
              aria-label="Play movie"
              className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-blue-600/90 text-white flex items-center justify-center hover:bg-blue-500 shadow-xl"
            >
              <Play className="w-7 h-7 ml-1 fill-white" />
            </button>
          )}

          {/* Bottom Control Deck */}
          <div className="relative z-10 bg-gradient-to-t from-black/95 via-black/70 to-transparent px-3 sm:px-5 pt-8 pb-3 space-y-2 text-white">
            {/* Seek Bar */}
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-mono tabular-nums text-slate-200 w-12">
                {formatDuration(currentTime)}
              </span>
              <input
                type="range"
                min={0}
                max={Math.max(1, duration)}
                step={0.5}
                value={Math.min(currentTime, Math.max(1, duration))}
                onChange={handleSeek}
                aria-label="Seek video position"
                className="flex-1 h-1.5 accent-blue-500 cursor-pointer"
              />
              <span className="text-xs font-mono tabular-nums text-slate-300 w-12 text-right">
                {formatDuration(duration)}
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={togglePlay}
                  aria-label={playing ? 'Pause' : 'Play'}
                  className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center"
                >
                  {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                </button>

                <button
                  type="button"
                  onClick={toggleMute}
                  aria-label={muted ? 'Unmute' : 'Mute'}
                  className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center"
                >
                  {muted || volume === 0 ? (
                    <VolumeX className="w-4 h-4" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={muted ? 0 : volume}
                  onChange={handleVolumeChange}
                  aria-label="Volume"
                  className="w-20 hidden sm:block accent-blue-500 cursor-pointer"
                />
              </div>

              <div className="flex items-center gap-2">
                {/* Playback Speed */}
                <select
                  aria-label="Playback speed"
                  value={playbackRate}
                  onChange={(e) => changeSpeed(Number(e.target.value))}
                  className="h-9 px-2 rounded-lg bg-slate-900 border border-slate-700 text-xs font-semibold text-white"
                >
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
                    <option key={r} value={r}>
                      {r}x
                    </option>
                  ))}
                </select>

                {/* Video Quality Selector */}
                <select
                  aria-label="Stream quality"
                  value={qualityLabel}
                  onChange={(e) => setQualityLabel(e.target.value as 'Auto' | 'Source HD')}
                  className="h-9 px-2 rounded-lg bg-slate-900 border border-slate-700 text-xs font-semibold text-white"
                >
                  <option value="Auto">Auto (Original)</option>
                  <option value="Source HD">Source HD</option>
                </select>

                <button
                  type="button"
                  onClick={() => void toggleFullscreen()}
                  aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                  className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center"
                >
                  {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Details, Actions, Comments & Related Movies */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-5">
          <div className="lg:col-span-2 space-y-5">
            <div className="space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    {movie.title || movie.caption}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {movie.category || 'Entertainment'} · {(movie.viewsCount ?? 0).toLocaleString()} views
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={onToggleLike}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold ${
                      isLiked
                        ? 'bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    <Heart className={`w-4 h-4 ${isLiked ? 'fill-blue-600' : ''}`} />
                    <span className="tabular-nums">{movie.likesCount}</span>
                  </button>

                  <button
                    type="button"
                    onClick={onToggleSave}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold ${
                      isSaved
                        ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-amber-500' : ''}`} />
                    <span>{isSaved ? 'Saved' : 'Save'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onShare();
                      setSharedCopied(true);
                      window.setTimeout(() => setSharedCopied(false), 1800);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold"
                  >
                    {sharedCopied ? (
                      <Check className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Share2 className="w-4 h-4" />
                    )}
                    <span>{sharedCopied ? 'Copied' : 'Share'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={downloading}
                    onClick={onDownload}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 text-xs font-semibold"
                  >
                    {downloading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    <span>
                      {downloading
                        ? downloadPct !== null
                          ? `Saving ${downloadPct}%`
                          : 'Saving...'
                        : 'Download'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={onReport}
                    aria-label="Report movie"
                    className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 hover:text-red-600 flex items-center justify-center"
                  >
                    <Flag className="w-4 h-4" />
                  </button>

                  {isOwnerOrAdmin && onDelete && (
                    <button
                      type="button"
                      onClick={onDelete}
                      aria-label="Delete movie"
                      className="w-9 h-9 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 flex items-center justify-center"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Creator Row */}
              <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    navigate(isOwner ? '/profile' : `/u/${movie.authorUsername}`);
                  }}
                  className="flex items-center gap-2.5 text-left min-w-0"
                >
                  <div className="w-10 h-10 rounded-full bg-blue-600 text-white font-bold text-sm flex items-center justify-center overflow-hidden shrink-0">
                    {movie.authorAvatarUrl ? (
                      <img
                        src={movie.authorAvatarUrl}
                        alt={movie.authorDisplayName}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      movie.authorDisplayName.slice(0, 1).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {movie.authorDisplayName}
                      </span>
                      {movie.authorVerified && <BadgeCheck className="w-4 h-4 text-blue-600 shrink-0" />}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
                      @{movie.authorUsername}
                    </p>
                  </div>
                </button>

                {!isOwner && (
                  <button
                    type="button"
                    onClick={onToggleFollow}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold ${
                      isFollowing
                        ? 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-300'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {isFollowing ? 'Following' : 'Follow'}
                  </button>
                )}
              </div>

              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                {movie.caption}
              </p>
            </div>

            {/* Movie Comments */}
            <section className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <MessageCircle className="w-4 h-4 text-blue-600" />
                <span>Comments ({comments.length})</span>
              </div>

              <form onSubmit={handlePostComment} className="flex gap-2">
                <input
                  type="text"
                  maxLength={500}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Share your thoughts on this video..."
                  className="flex-1 h-10 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 focus:border-blue-600 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={postingComment || !commentText.trim()}
                  aria-label="Send movie comment"
                  className="px-4 h-10 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {postingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  <span className="hidden sm:inline">Post</span>
                </button>
              </form>

              <div className="space-y-2.5 max-h-60 overflow-y-auto">
                {comments.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 py-3">No comments yet.</p>
                ) : (
                  comments.map((c) => (
                    <div
                      key={c.id}
                      className="bg-slate-50 dark:bg-slate-800/70 rounded-xl p-3 flex items-start justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            {c.authorDisplayName}
                          </span>
                          {c.authorVerified && <BadgeCheck className="w-3.5 h-3.5 text-blue-600" />}
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                            @{c.authorUsername}
                          </span>
                        </div>
                        <p className="text-sm text-slate-700 dark:text-slate-200 mt-0.5 break-words">{c.content}</p>
                      </div>
                      {(firebaseUser?.uid === c.authorId || isAdmin) && (
                        <button
                          type="button"
                          onClick={() => void deleteVideoComment(c.id, movie.id)}
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
            </section>
          </div>

          {/* Related Movies Sidebar */}
          <aside className="space-y-3 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 pt-4 lg:pt-0 lg:pl-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Related Movies</h3>
              <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={preferences.autoPlayNextMovie}
                  onChange={(e) => updatePreference('autoPlayNextMovie', e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-600 cursor-pointer"
                />
                <span>Autoplay next</span>
              </label>
            </div>
            {relatedMovies.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">No related movies available yet.</p>
            ) : (
              <div className="space-y-2.5">
                {relatedMovies.map((rel) => {
                  const status = getVideoPreloadStatus(rel.videoUrl);
                  return (
                    <button
                      key={rel.id}
                      type="button"
                      onClick={() => onSelectMovie(rel)}
                      className="w-full flex gap-3 p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-left transition-colors"
                    >
                      <div className="relative w-32 aspect-video rounded-lg overflow-hidden bg-slate-900 shrink-0">
                        {rel.thumbnailUrl ? (
                          <img
                            src={rel.thumbnailUrl}
                            alt={rel.title || rel.caption}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <video
                            src={rel.videoUrl}
                            muted
                            playsInline
                            preload="metadata"
                            className="w-full h-full object-cover"
                          />
                        )}
                        {rel.durationSec > 0 && (
                          <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-white text-[10px] font-mono">
                            {formatDuration(rel.durationSec)}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-900 dark:text-white line-clamp-2">
                          {rel.title || rel.caption}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                          {rel.authorDisplayName}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {rel.category || 'Entertainment'} · {rel.likesCount} likes
                          {status === 'ready' || status === 'warmed' ? ' · Preloaded' : ''}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

export function MoviesPage() {
  const { firebaseUser, isVerifiedIdentity, profile, isAdmin } = useAuth();
  const { preferences, updatePreference } = usePreferences();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [allVideos, setAllVideos] = useState<ShortVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') || '');
  const [selectedGenre, setSelectedGenre] = useState<string>('All');
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [watchProgress, setWatchProgress] = useState<Record<string, WatchProgressEntry>>(() =>
    getWatchProgressMap()
  );

  const [activeMovie, setActiveMovie] = useState<ShortVideo | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadPct, setDownloadPct] = useState<number | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<ShortVideo | null>(null);

  const loadMovies = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchShortVideosPage(40, null);
      setAllVideos(res.videos);
      if (!preferences.dataSaverMode) {
        warmMediaBatch(
          res.videos
            .filter((v) => v.videoFormat === 'long')
            .slice(0, 6)
            .map((v) => v.thumbnailUrl),
          6
        );
      }
    } finally {
      setLoading(false);
    }
  }, [preferences.dataSaverMode]);

  useEffect(() => {
    void loadMovies();
  }, [loadMovies]);

  useEffect(() => {
    const q = searchParams.get('q');
    if (q !== null) setSearchQuery(q);
  }, [searchParams]);

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

  const movies = useMemo(
    () => allVideos.filter((v) => v.videoFormat === 'long'),
    [allVideos]
  );

  const filteredMovies = useMemo(() => {
    let list = movies;
    if (selectedGenre !== 'All') {
      list = list.filter(
        (m) => (m.category || 'Entertainment').toLowerCase() === selectedGenre.toLowerCase()
      );
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (m) =>
          (m.title || '').toLowerCase().includes(q) ||
          m.caption.toLowerCase().includes(q) ||
          m.authorDisplayName.toLowerCase().includes(q) ||
          m.authorUsername.toLowerCase().includes(q) ||
          (m.category || '').toLowerCase().includes(q) ||
          (m.hashtags || []).some((h) => h.includes(q.replace(/^#/, '')))
      );
    }
    return list;
  }, [movies, selectedGenre, searchQuery]);

  const featuredMovie = useMemo(() => {
    if (filteredMovies.length === 0) return null;
    return [...filteredMovies].sort(
      (a, b) =>
        b.likesCount * 3 + (b.viewsCount ?? 0) - (a.likesCount * 3 + (a.viewsCount ?? 0))
    )[0];
  }, [filteredMovies]);

  const continueWatchingList = useMemo(() => {
    return movies
      .filter((m) => Boolean(watchProgress[m.id]))
      .sort((a, b) => (watchProgress[b.id]?.updatedAt ?? 0) - (watchProgress[a.id]?.updatedAt ?? 0));
  }, [movies, watchProgress]);

  const trendingMovies = useMemo(() => {
    return [...filteredMovies].sort(
      (a, b) =>
        b.likesCount * 3 +
        b.sharesCount * 4 +
        (b.viewsCount ?? 0) -
        (a.likesCount * 3 + a.sharesCount * 4 + (a.viewsCount ?? 0))
    );
  }, [filteredMovies]);

  const popularMovies = useMemo(() => {
    return [...filteredMovies].sort(
      (a, b) => b.likesCount + b.commentsCount - (a.likesCount + a.commentsCount)
    );
  }, [filteredMovies]);

  const recentlyUploaded = useMemo(() => {
    return [...filteredMovies].sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)
    );
  }, [filteredMovies]);

  const recommendedMovies = useMemo(() => {
    return [...filteredMovies].sort((a, b) => {
      const aBoost =
        (followingIds.has(a.authorId) ? 25 : 0) + (savedIds.has(a.id) ? 10 : 0) + a.likesCount;
      const bBoost =
        (followingIds.has(b.authorId) ? 25 : 0) + (savedIds.has(b.id) ? 10 : 0) + b.likesCount;
      return bBoost - aBoost;
    });
  }, [filteredMovies, followingIds, savedIds]);

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

  const handleDownloadMovie = async (movie: ShortVideo) => {
    if (downloadingId) return;
    setDownloadingId(movie.id);
    setDownloadPct(0);
    setDownloadError(null);
    try {
      await downloadMediaFile(
        movie.videoUrl,
        `ainemax_movie_${movie.title || movie.authorUsername}_${movie.id.slice(0, 6)}`,
        {
          onProgress: (info) => {
            if (info.percent !== null) setDownloadPct(info.percent);
          },
        }
      );
    } catch (err) {
      setDownloadError(
        err instanceof Error ? err.message : 'Unable to download this movie right now.'
      );
    } finally {
      setDownloadingId(null);
      setDownloadPct(null);
    }
  };

  const handleProgressUpdate = useCallback(
    (videoId: string, timeSec: number, durationSec: number) => {
      saveWatchProgress(videoId, timeSec, durationSec);
      setWatchProgress(getWatchProgressMap());
    },
    []
  );

  return (
    <div className="space-y-6">
      {/* Download Error Banner */}
      {downloadError && (
        <div className="bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 rounded-2xl px-4 py-3 text-xs text-red-800 dark:text-red-200 flex items-center justify-between gap-2">
          <span>{downloadError}</span>
          <button
            type="button"
            onClick={() => setDownloadError(null)}
            aria-label="Dismiss download error"
            className="text-red-600 dark:text-red-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* VidMate-Inspired AINEMAX Movies Header & Search */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
              <Clapperboard className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">AINEMAX Movies &amp; Long Videos</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Full-length films, music sessions, tutorials, and creator episodes in 16:9 widescreen
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (!requireAuth()) return;
              setUploadOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[42px] rounded-xl bg-blue-600 text-white text-xs sm:text-sm font-semibold hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Upload Movie / Video</span>
          </button>
        </div>

        {/* Search, Preload Controls & Genre Filters */}
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search movies by title, creator, genre, or #tag..."
              className="w-full h-11 pl-10 pr-9 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 focus:border-blue-600 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="absolute right-3 top-3 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Video preload mode"
              value={preferences.preloadMode}
              onChange={(e) => updatePreference('preloadMode', e.target.value as VideoPreloadMode)}
              className="h-11 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:border-blue-600 focus:outline-none"
            >
              <option value="off">Preload: Off</option>
              <option value="standard">Preload: Standard</option>
              <option value="high">Preload: High (Next 3)</option>
            </select>

            <label className="inline-flex items-center gap-2 h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={preferences.autoDownloadNextVideos}
                onChange={(e) => updatePreference('autoDownloadNextVideos', e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600 cursor-pointer"
              />
              <span>Auto-download next</span>
            </label>
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <SlidersHorizontal className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
          {['All', ...MOVIE_GENRES].map((genre) => {
            const active = selectedGenre === genre;
            return (
              <button
                key={genre}
                type="button"
                onClick={() => setSelectedGenre(genre)}
                className={`px-3.5 py-2 min-h-[38px] rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {genre}
              </button>
            );
          })}
        </div>
      </section>

      {loading ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 flex flex-col items-center justify-center gap-3 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          <span>Loading AINEMAX Movies library...</span>
        </div>
      ) : filteredMovies.length === 0 ? (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center space-y-3">
          <Clapperboard className="w-10 h-10 text-blue-600 mx-auto" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            {movies.length === 0 ? 'No movies or long videos uploaded yet' : 'No movies match your filter'}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            {movies.length === 0
              ? 'Upload your first widescreen film, tutorial, or show to build the AINEMAX Movies library.'
              : 'Try another genre or clear your search term.'}
          </p>
          <div className="flex justify-center gap-2">
            {movies.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSelectedGenre('All');
                  setSearchQuery('');
                }}
                className="px-4 py-2.5 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Reset filters
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (!requireAuth()) return;
                setUploadOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
            >
              <Upload className="w-4 h-4" />
              <span>Upload Movie</span>
            </button>
          </div>
        </section>
      ) : (
        <div className="space-y-8">
          {/* Featured Movie Hero */}
          {featuredMovie && !searchQuery && selectedGenre === 'All' && (
            <section className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-200 shadow-sm">
              <div className="grid grid-cols-1 lg:grid-cols-5">
                <div className="lg:col-span-3 relative aspect-video bg-black">
                  {featuredMovie.thumbnailUrl ? (
                    <img
                      src={featuredMovie.thumbnailUrl}
                      alt={featuredMovie.title || featuredMovie.caption}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <video
                      src={featuredMovie.videoUrl}
                      muted
                      playsInline
                      preload="metadata"
                      className="w-full h-full object-cover"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent flex items-end p-4">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-blue-400">
                      <Sparkles className="w-3.5 h-3.5" />
                      Featured Movie
                    </span>
                  </div>
                </div>

                <div className="lg:col-span-2 p-6 text-white flex flex-col justify-between gap-4">
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2 text-xs text-blue-300 font-semibold">
                      <span>{featuredMovie.category || 'Entertainment'}</span>
                      <span>·</span>
                      <span>{formatDuration(featuredMovie.durationSec)}</span>
                      <span>·</span>
                      <span>HD</span>
                    </div>
                    <h3 className="text-xl font-bold leading-snug">
                      {featuredMovie.title || featuredMovie.caption}
                    </h3>
                    <p className="text-sm text-slate-300 line-clamp-3">{featuredMovie.caption}</p>
                    <p className="text-xs text-slate-400">
                      By {featuredMovie.authorDisplayName} (@{featuredMovie.authorUsername})
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => setActiveMovie(featuredMovie)}
                      className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500"
                    >
                      <Play className="w-4 h-4 fill-white" />
                      <span>
                        {watchProgress[featuredMovie.id] ? 'Resume Watching' : 'Play Now'}
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={downloadingId === featuredMovie.id}
                      onClick={() => void handleDownloadMovie(featuredMovie)}
                      className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium"
                    >
                      {downloadingId === featuredMovie.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                      <span>
                        {downloadingId === featuredMovie.id
                          ? downloadPct !== null
                            ? `Downloading ${downloadPct}%`
                            : 'Downloading...'
                          : 'Download'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Continue Watching */}
          {continueWatchingList.length > 0 && !searchQuery && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Continue Watching</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {continueWatchingList.map((movie) => (
                  <MovieCard
                    key={`cw_${movie.id}`}
                    movie={movie}
                    progress={watchProgress[movie.id]}
                    onPlay={setActiveMovie}
                    onDownload={(m) => void handleDownloadMovie(m)}
                    downloading={downloadingId === movie.id}
                    downloadPct={downloadingId === movie.id ? downloadPct : null}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Trending Movies */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {searchQuery || selectedGenre !== 'All' ? 'Search Results' : 'Trending Movies'}
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {trendingMovies.map((movie) => (
                <MovieCard
                  key={movie.id}
                  movie={movie}
                  progress={watchProgress[movie.id]}
                  onPlay={setActiveMovie}
                  onDownload={(m) => void handleDownloadMovie(m)}
                  downloading={downloadingId === movie.id}
                  downloadPct={downloadingId === movie.id ? downloadPct : null}
                />
              ))}
            </div>
          </section>

          {/* Popular Films & Recently Uploaded Shelves when browsing default library */}
          {!searchQuery && selectedGenre === 'All' && movies.length > 1 && (
            <>
              <section className="space-y-3">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Popular Films</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {popularMovies.slice(0, 6).map((movie) => (
                    <MovieCard
                      key={`pop_${movie.id}`}
                      movie={movie}
                      progress={watchProgress[movie.id]}
                      onPlay={setActiveMovie}
                      onDownload={(m) => void handleDownloadMovie(m)}
                      downloading={downloadingId === movie.id}
                      downloadPct={downloadingId === movie.id ? downloadPct : null}
                    />
                  ))}
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Recently Uploaded</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {recentlyUploaded.slice(0, 6).map((movie) => (
                    <MovieCard
                      key={`rec_${movie.id}`}
                      movie={movie}
                      progress={watchProgress[movie.id]}
                      onPlay={setActiveMovie}
                      onDownload={(m) => void handleDownloadMovie(m)}
                      downloading={downloadingId === movie.id}
                      downloadPct={downloadingId === movie.id ? downloadPct : null}
                    />
                  ))}
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Recommended For You</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {recommendedMovies.slice(0, 6).map((movie) => (
                    <MovieCard
                      key={`reco_${movie.id}`}
                      movie={movie}
                      progress={watchProgress[movie.id]}
                      onPlay={setActiveMovie}
                      onDownload={(m) => void handleDownloadMovie(m)}
                      downloading={downloadingId === movie.id}
                      downloadPct={downloadingId === movie.id ? downloadPct : null}
                    />
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      )}

      {/* Landscape Movie Player Modal */}
      {activeMovie && (
        <MoviePlayerModal
          movie={activeMovie}
          allMovies={movies}
          isLiked={likedIds.has(activeMovie.id)}
          isSaved={savedIds.has(activeMovie.id)}
          isFollowing={followingIds.has(activeMovie.authorId)}
          isOwnerOrAdmin={firebaseUser?.uid === activeMovie.authorId || isAdmin}
          initialTimeSec={watchProgress[activeMovie.id]?.currentTimeSec ?? 0}
          onClose={() => setActiveMovie(null)}
          onSelectMovie={(m) => setActiveMovie(m)}
          onToggleLike={() => {
            if (!requireAuth() || !firebaseUser) return;
            const liked = likedIds.has(activeMovie.id);
            setAllVideos((prev) =>
              prev.map((v) =>
                v.id === activeMovie.id
                  ? { ...v, likesCount: Math.max(0, v.likesCount + (liked ? -1 : 1)) }
                  : v
              )
            );
            setActiveMovie((curr) =>
              curr && curr.id === activeMovie.id
                ? { ...curr, likesCount: Math.max(0, curr.likesCount + (liked ? -1 : 1)) }
                : curr
            );
            void toggleLikeVideo(
              activeMovie.id,
              firebaseUser.uid,
              liked,
              profile,
              activeMovie.authorId
            );
          }}
          onToggleSave={() => {
            if (!requireAuth() || !firebaseUser) return;
            void toggleSaveVideo(activeMovie.id, firebaseUser.uid, savedIds.has(activeMovie.id));
          }}
          onToggleFollow={async () => {
            if (!requireAuth() || !profile) return;
            if (followingIds.has(activeMovie.authorId)) {
              await unfollowUser(profile.uid, activeMovie.authorId);
            } else {
              const target = await fetchUserProfileById(activeMovie.authorId);
              if (target) await followUser(profile, target);
            }
          }}
          onShare={() => {
            const url = `${window.location.origin}/movies`;
            if (navigator.share) {
              void navigator.share({
                title: activeMovie.title || activeMovie.caption,
                url,
              });
            } else {
              void navigator.clipboard?.writeText(url);
            }
            if (firebaseUser) {
              void incrementVideoShare(activeMovie.id);
            }
          }}
          onDownload={() => void handleDownloadMovie(activeMovie)}
          downloading={downloadingId === activeMovie.id}
          downloadPct={downloadingId === activeMovie.id ? downloadPct : null}
          onReport={() => {
            if (!requireAuth()) return;
            setReportTarget(activeMovie);
          }}
          onDelete={
            firebaseUser?.uid === activeMovie.authorId || isAdmin
              ? () => {
                  const idToRemove = activeMovie.id;
                  void deleteShortVideo(idToRemove, activeMovie.authorId).then(() => {
                    setAllVideos((prev) => prev.filter((v) => v.id !== idToRemove));
                    setActiveMovie(null);
                  });
                }
              : undefined
          }
          onProgressUpdate={handleProgressUpdate}
        />
      )}

      {uploadOpen && (
        <UploadHubModal
          initialCategory="long"
          onClose={() => setUploadOpen(false)}
          onSuccess={(cat) => {
            if (cat === 'short') navigate('/videos');
            else if (cat === 'story') navigate('/stories');
            else void loadMovies();
          }}
        />
      )}

      {reportTarget && (
        <ReportModal
          targetType="video"
          targetId={reportTarget.id}
          targetLabel={reportTarget.title || reportTarget.caption}
          onClose={() => setReportTarget(null)}
        />
      )}
    </div>
  );
}
