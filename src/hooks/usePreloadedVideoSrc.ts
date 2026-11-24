import { useCallback, useEffect, useRef, useState } from 'react';
import {
  VideoPreloadStatus,
  getCachedVideoObjectUrl,
  getVideoPreloadStatus,
  releasePreloadedVideoUrl,
  retainPreloadedVideoUrl,
  subscribeVideoPreloadState,
} from '../services/videoPreloadService';

/**
 * Resolves a video URL to a retained local Blob Object URL whenever preloaded,
 * without interrupting an already-playing network stream mid-playback.
 * Also provides an explicit upgradeToCachedSrc() helper for stall recovery.
 */
export function usePreloadedVideoSrc(rawUrl: string | undefined, isActivelyPlaying: boolean) {
  const retainedUrlRef = useRef<string | null>(null);

  const [src, setSrc] = useState<string | undefined>(() => {
    if (!rawUrl) return undefined;
    const cached = retainPreloadedVideoUrl(rawUrl);
    if (cached) {
      retainedUrlRef.current = rawUrl;
      return cached;
    }
    return rawUrl;
  });

  const [preloadStatus, setPreloadStatus] = useState<VideoPreloadStatus>(() =>
    rawUrl ? getVideoPreloadStatus(rawUrl) : 'idle'
  );

  // Sync whenever rawUrl changes
  useEffect(() => {
    if (retainedUrlRef.current && retainedUrlRef.current !== rawUrl) {
      releasePreloadedVideoUrl(retainedUrlRef.current);
      retainedUrlRef.current = null;
    }

    if (!rawUrl) {
      setSrc(undefined);
      setPreloadStatus('idle');
      return;
    }

    const cached = getCachedVideoObjectUrl(rawUrl);
    if (cached) {
      if (retainedUrlRef.current !== rawUrl) {
        retainPreloadedVideoUrl(rawUrl);
        retainedUrlRef.current = rawUrl;
      }
      setSrc(cached);
    } else {
      setSrc(rawUrl);
    }
    setPreloadStatus(getVideoPreloadStatus(rawUrl));
  }, [rawUrl]);

  // Listen for background auto-download completions
  useEffect(() => {
    if (!rawUrl) return;
    return subscribeVideoPreloadState(() => {
      const nextStatus = getVideoPreloadStatus(rawUrl);
      setPreloadStatus(nextStatus);

      // Only hot-swap to blob URL automatically if the video is NOT actively mid-playback
      const cached = getCachedVideoObjectUrl(rawUrl);
      if (cached && !isActivelyPlaying) {
        if (retainedUrlRef.current !== rawUrl) {
          retainPreloadedVideoUrl(rawUrl);
          retainedUrlRef.current = rawUrl;
        }
        setSrc((curr) => (curr === cached ? curr : cached));
      }
    });
  }, [rawUrl, isActivelyPlaying]);

  // Release retained refCount on unmount
  useEffect(() => {
    return () => {
      if (retainedUrlRef.current) {
        releasePreloadedVideoUrl(retainedUrlRef.current);
        retainedUrlRef.current = null;
      }
    };
  }, []);

  const promoteToCachedBlob = useCallback((): string | null => {
    if (!rawUrl) return null;
    const cached = getCachedVideoObjectUrl(rawUrl);
    if (!cached) return null;
    if (retainedUrlRef.current !== rawUrl) {
      retainPreloadedVideoUrl(rawUrl);
      retainedUrlRef.current = rawUrl;
    }
    setSrc(cached);
    return cached;
  }, [rawUrl]);

  return {
    src,
    preloadStatus,
    isBlobCached: Boolean(src && src.startsWith('blob:')),
    promoteToCachedBlob,
  };
}
