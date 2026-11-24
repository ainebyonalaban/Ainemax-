import { VideoPreloadMode } from '../context/PreferencesContext';
import {
  MEDIA_CACHE_BUCKET,
  registerPreloadedBlobResolver,
  resolveCachedMediaUrl,
} from './mediaUploadService';

interface BlobPoolEntry {
  sourceUrl: string;
  objectUrl: string;
  blob: Blob;
  byteLength: number;
  refCount: number;
}

export type VideoPreloadStatus = 'idle' | 'loading' | 'ready' | 'warmed';

export interface PreloadQueueItem {
  url: string;
  maxFullBytes?: number;
}

const MAX_BLOB_ENTRIES = 8;
const MAX_BLOB_TOTAL_BYTES = 140 * 1024 * 1024; // 140MB RAM budget for smooth mobile playback
const DEFAULT_MAX_FULL_BYTES = 50 * 1024 * 1024;
const INITIAL_RANGE_WARM_BYTES = 4 * 1024 * 1024;

const blobPool = new Map<string, BlobPoolEntry>();
let blobPoolTotalBytes = 0;

const preloadStatuses = new Map<string, VideoPreloadStatus>();
const activeControllers = new Map<string, AbortController>();
const listeners = new Set<() => void>();
let nativeWarmupElements: HTMLVideoElement[] = [];
let queueGeneration = 0;

registerPreloadedBlobResolver((rawUrl: string) => blobPool.get(rawUrl)?.blob ?? null);

function notifyListeners(): void {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {
      // Ignore subscriber failure
    }
  });
}

export function subscribeVideoPreloadState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getVideoPreloadStatus(rawUrl: string): VideoPreloadStatus {
  if (!rawUrl) return 'idle';
  if (blobPool.has(rawUrl)) return 'ready';
  return preloadStatuses.get(rawUrl) ?? 'idle';
}

export function getCachedVideoObjectUrl(rawUrl?: string): string | null {
  if (!rawUrl) return null;
  const hit = blobPool.get(rawUrl);
  if (!hit) return null;
  blobPool.delete(rawUrl);
  blobPool.set(rawUrl, hit);
  return hit.objectUrl;
}

export function retainPreloadedVideoUrl(rawUrl: string): string | null {
  const hit = blobPool.get(rawUrl);
  if (!hit) return null;
  hit.refCount += 1;
  blobPool.delete(rawUrl);
  blobPool.set(rawUrl, hit);
  return hit.objectUrl;
}

export function releasePreloadedVideoUrl(rawUrl: string): void {
  const hit = blobPool.get(rawUrl);
  if (!hit) return;
  hit.refCount = Math.max(0, hit.refCount - 1);
}

function evictBlobPoolIfNeeded(incomingBytes: number): void {
  if (blobPool.size < MAX_BLOB_ENTRIES && blobPoolTotalBytes + incomingBytes <= MAX_BLOB_TOTAL_BYTES) {
    return;
  }

  for (const [key, entry] of blobPool.entries()) {
    if (
      blobPool.size < MAX_BLOB_ENTRIES &&
      blobPoolTotalBytes + incomingBytes <= MAX_BLOB_TOTAL_BYTES
    ) {
      break;
    }
    if (entry.refCount > 0) continue;
    blobPool.delete(key);
    blobPoolTotalBytes = Math.max(0, blobPoolTotalBytes - entry.byteLength);
    try {
      URL.revokeObjectURL(entry.objectUrl);
    } catch {
      // Ignore revoke errors
    }
  }
}

function storeBlobInPool(rawUrl: string, blob: Blob): string {
  const existing = blobPool.get(rawUrl);
  if (existing) {
    blobPool.delete(rawUrl);
    blobPool.set(rawUrl, existing);
    preloadStatuses.set(rawUrl, 'ready');
    return existing.objectUrl;
  }

  evictBlobPoolIfNeeded(blob.size);
  const objectUrl = URL.createObjectURL(blob);
  blobPool.set(rawUrl, {
    sourceUrl: rawUrl,
    objectUrl,
    blob,
    byteLength: blob.size,
    refCount: 0,
  });
  blobPoolTotalBytes += blob.size;
  preloadStatuses.set(rawUrl, 'ready');
  notifyListeners();
  return objectUrl;
}

function warmNativeVideoElement(resolvedUrl: string, rawUrl: string): void {
  if (typeof document === 'undefined') return;
  try {
    while (nativeWarmupElements.length >= 2) {
      const old = nativeWarmupElements.shift();
      if (old) {
        old.removeAttribute('src');
        old.load();
      }
    }
    const vid = document.createElement('video');
    vid.preload = 'auto';
    vid.muted = true;
    vid.playsInline = true;
    vid.oncanplaythrough = () => {
      preloadStatuses.set(rawUrl, 'warmed');
      notifyListeners();
    };
    vid.src = resolvedUrl;
    vid.load();
    nativeWarmupElements.push(vid);
    preloadStatuses.set(rawUrl, 'warmed');
    notifyListeners();
  } catch {
    // Non-fatal fallback
  }
}

export function clearNativeWarmupElements(): void {
  nativeWarmupElements.forEach((el) => {
    el.removeAttribute('src');
    el.load();
  });
  nativeWarmupElements = [];
}

async function autoDownloadVideoAsset(
  item: PreloadQueueItem,
  signal: AbortSignal
): Promise<void> {
  const rawUrl = item.url;
  if (!rawUrl || signal.aborted) return;
  if (blobPool.has(rawUrl)) {
    preloadStatuses.set(rawUrl, 'ready');
    return;
  }

  const maxFullBytes = item.maxFullBytes ?? DEFAULT_MAX_FULL_BYTES;
  preloadStatuses.set(rawUrl, 'loading');
  notifyListeners();

  try {
    const resolvedUrl = await resolveCachedMediaUrl(rawUrl);
    if (!resolvedUrl || signal.aborted) return;
    if (!/^(https?:\/\/|\/api\/media\/)/i.test(resolvedUrl)) return;

    if (typeof caches !== 'undefined') {
      try {
        const cache = await caches.open(MEDIA_CACHE_BUCKET);
        const cachedResp = await cache.match(resolvedUrl);
        if (cachedResp && cachedResp.ok) {
          const blob = await cachedResp.blob();
          if (!signal.aborted && blob.size > 0 && blob.size <= maxFullBytes) {
            storeBlobInPool(rawUrl, blob);
            return;
          }
        }
      } catch {
        // Cache Storage unavailable
      }
    }

    const resp = await fetch(resolvedUrl, {
      cache: 'force-cache',
      signal,
    });

    if (!resp.ok) {
      preloadStatuses.delete(rawUrl);
      notifyListeners();
      return;
    }

    const contentLengthHeader = resp.headers.get('content-length');
    const expectedBytes = contentLengthHeader ? Number(contentLengthHeader) : 0;

    if (expectedBytes > maxFullBytes) {
      try {
        await resp.body?.cancel();
      } catch {
        // Ignore stream cancel error
      }
      if (signal.aborted) return;
      try {
        await fetch(resolvedUrl, {
          headers: { Range: `bytes=0-${INITIAL_RANGE_WARM_BYTES - 1}` },
          signal,
        });
      } catch {
        // Ignore range warm failure
      }
      warmNativeVideoElement(resolvedUrl, rawUrl);
      return;
    }

    const blob = await resp.blob();
    if (signal.aborted || blob.size <= 0) {
      if (!blobPool.has(rawUrl)) preloadStatuses.delete(rawUrl);
      return;
    }

    if (blob.size <= maxFullBytes) {
      if (typeof caches !== 'undefined') {
        try {
          const cache = await caches.open(MEDIA_CACHE_BUCKET);
          await cache.put(
            resolvedUrl,
            new Response(blob, {
              status: 200,
              headers: {
                'Content-Type': blob.type || 'video/mp4',
                'Cache-Control': 'public, max-age=31536000, immutable',
              },
            })
          );
        } catch {
          // Non-fatal CacheStorage quota error
        }
      }
      storeBlobInPool(rawUrl, blob);
    } else {
      preloadStatuses.set(rawUrl, 'warmed');
      notifyListeners();
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      if (!blobPool.has(rawUrl)) preloadStatuses.delete(rawUrl);
      return;
    }
    try {
      const resolvedUrl = await resolveCachedMediaUrl(rawUrl);
      if (resolvedUrl && !signal.aborted) {
        warmNativeVideoElement(resolvedUrl, rawUrl);
      }
    } catch {
      preloadStatuses.delete(rawUrl);
      notifyListeners();
    }
  }
}

/**
 * Schedules priority preloading of the immediate next videos while watching.
 * Prioritizes the first item (activeIndex + 1) sequentially before prefetching activeIndex + 2,
 * and avoids competing with the currently playing stream via configurable start delay.
 */
export function scheduleVideoPreloadQueue(
  items: PreloadQueueItem[],
  options: {
    enabled: boolean;
    concurrency?: number;
    delayMs?: number;
  }
): () => void {
  const myGen = ++queueGeneration;

  if (!options.enabled || items.length === 0 || typeof window === 'undefined') {
    activeControllers.forEach((ctrl, key) => {
      ctrl.abort();
      activeControllers.delete(key);
      if (!blobPool.has(key)) preloadStatuses.delete(key);
    });
    clearNativeWarmupElements();
    return () => {};
  }

  const targetUrls = new Set(items.map((i) => i.url).filter(Boolean));

  for (const [url, ctrl] of activeControllers.entries()) {
    if (!targetUrls.has(url)) {
      ctrl.abort();
      activeControllers.delete(url);
      if (!blobPool.has(url)) preloadStatuses.delete(url);
    }
  }

  const pending = items.filter(
    (item) =>
      Boolean(item.url) &&
      !blobPool.has(item.url) &&
      !activeControllers.has(item.url) &&
      preloadStatuses.get(item.url) !== 'warmed'
  );

  if (pending.length === 0) {
    return () => {
      if (queueGeneration === myGen) {
        for (const [url, ctrl] of activeControllers.entries()) {
          ctrl.abort();
          activeControllers.delete(url);
        }
      }
    };
  }

  const maxConcurrency = Math.max(1, Math.min(2, options.concurrency ?? 1));
  let idx = 0;

  const runWorker = async () => {
    while (idx < pending.length && queueGeneration === myGen) {
      const item = pending[idx];
      idx += 1;
      if (!item.url || blobPool.has(item.url) || activeControllers.has(item.url)) continue;

      const controller = new AbortController();
      activeControllers.set(item.url, controller);
      try {
        await autoDownloadVideoAsset(item, controller.signal);
      } finally {
        if (activeControllers.get(item.url) === controller) {
          activeControllers.delete(item.url);
        }
      }
    }
  };

  const timer = window.setTimeout(() => {
    if (queueGeneration !== myGen) return;
    void Promise.all(Array.from({ length: maxConcurrency }, () => runWorker()));
  }, options.delayMs ?? 120);

  return () => {
    window.clearTimeout(timer);
  };
}

export function getLookaheadCount(mode: VideoPreloadMode, dataSaverMode: boolean): number {
  if (dataSaverMode || mode === 'off') return 0;
  return mode === 'high' ? 3 : 2;
}
