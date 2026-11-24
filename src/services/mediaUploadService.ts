import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  StorageReference,
  UploadTask,
  getDownloadURL,
  ref,
  uploadBytesResumable,
} from 'firebase/storage';
import { db, storage } from '../lib/firebase';

export const MEDIA_LIMITS = {
  IMAGE_MAX_BYTES: 10 * 1024 * 1024, // 10MB
  VIDEO_MAX_BYTES: 50 * 1024 * 1024, // 50MB (Firebase Storage)
  FALLBACK_MAX_BYTES: 25_000_000, // ~23.8MB (47 * 540KB chunks)
} as const;

export type UploadStage =
  | 'pending'
  | 'preparing'
  | 'uploading'
  | 'paused'
  | 'completed'
  | 'failed';

export interface UploadProgressInfo {
  stage: UploadStage;
  percent: number;
  bytesTransferred: number;
  totalBytes: number;
  speedBytesPerSec: number | null;
  etaSeconds: number | null;
}

export interface UploadControlHandle {
  pause: () => boolean;
  resume: () => boolean;
  cancel: () => void;
}

export interface UploadLifecycleOptions {
  onDetail?: (info: UploadProgressInfo) => void;
  onControl?: (handle: UploadControlHandle) => void;
}

export interface DownloadProgressInfo {
  percent: number | null;
  receivedBytes: number;
  totalBytes: number | null;
}

export interface DownloadMediaOptions {
  onProgress?: (info: DownloadProgressInfo) => void;
  signal?: AbortSignal;
}

// 540,000 bytes (divisible by 3) -> 720,000 base64 chars (< 750,000 Firestore rule limit)
const CHUNK_RAW_BYTES = 540_000;
const UPLOAD_WORKER_CONCURRENCY = 8;

const STORAGE_STALL_MS = 12_000;
const STORAGE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const STORAGE_SESSION_KEY = 'ainemax_storage_unavailable';

// Two-tier getDownloadURL & Browser Cache Storage configuration
const DOWNLOAD_URL_STORAGE_KEY = 'ainemax_dlurl_cache_v1';
const DOWNLOAD_URL_SOFT_TTL_MS = 60 * 60 * 1000; // 1h stale-while-revalidate window
const DOWNLOAD_URL_HARD_TTL_MS = 24 * 60 * 60 * 1000; // 24h max cache age
const MAX_CACHED_URL_ENTRIES = 250;
export const MEDIA_CACHE_BUCKET = 'ainemax-media-v1';

interface CachedDownloadUrlEntry {
  url: string;
  cachedAt: number;
  expiresAt: number;
}

const downloadUrlMemoryCache = new Map<string, CachedDownloadUrlEntry>();
const inflightUrlLookups = new Map<string, Promise<string>>();
const inflightPrefetches = new Set<string>();
const inflightDownloads = new Map<
  string,
  { promise: Promise<void>; listeners: Set<(info: DownloadProgressInfo) => void> }
>();
let preloadedBlobResolver: ((rawUrl: string) => Blob | null) | null = null;
let persistentCacheLoaded = false;
let webpSupportCached: boolean | null = null;

export function registerPreloadedBlobResolver(resolver: (rawUrl: string) => Blob | null): void {
  preloadedBlobResolver = resolver;
}

function isStorageMarkedUnavailable(): boolean {
  try {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(STORAGE_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function markStorageUnavailable(): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(STORAGE_SESSION_KEY, '1');
    }
  } catch {
    // Ignore storage access restrictions
  }
}

function getStorageCacheKey(storageRef: StorageReference): string {
  return `${storageRef.bucket}/${storageRef.fullPath}`;
}

function loadPersistentUrlCache(): void {
  if (persistentCacheLoaded) return;
  persistentCacheLoaded = true;
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(DOWNLOAD_URL_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, CachedDownloadUrlEntry>;
    const now = Date.now();
    for (const [key, entry] of Object.entries(parsed)) {
      if (
        entry &&
        typeof entry.url === 'string' &&
        typeof entry.expiresAt === 'number' &&
        entry.expiresAt > now
      ) {
        downloadUrlMemoryCache.set(key, entry);
      }
    }
  } catch {
    // Ignore corrupted cache
  }
}

function persistUrlCache(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const now = Date.now();
    while (downloadUrlMemoryCache.size > MAX_CACHED_URL_ENTRIES) {
      const oldestKey = downloadUrlMemoryCache.keys().next().value;
      if (!oldestKey) break;
      downloadUrlMemoryCache.delete(oldestKey);
    }
    const serialized: Record<string, CachedDownloadUrlEntry> = {};
    for (const [key, entry] of downloadUrlMemoryCache.entries()) {
      if (entry.expiresAt > now) {
        serialized[key] = entry;
      }
    }
    localStorage.setItem(DOWNLOAD_URL_STORAGE_KEY, JSON.stringify(serialized));
  } catch {
    // Ignore quota / private browsing errors
  }
}

export function primeDownloadUrlCache(storageRefOrPath: StorageReference | string, url: string): void {
  if (!url) return;
  loadPersistentUrlCache();
  const key =
    typeof storageRefOrPath === 'string'
      ? `${storage.app.options.storageBucket || 'default'}/${storageRefOrPath.replace(/^\/+/, '')}`
      : getStorageCacheKey(storageRefOrPath);
  const now = Date.now();
  downloadUrlMemoryCache.delete(key);
  downloadUrlMemoryCache.set(key, {
    url,
    cachedAt: now,
    expiresAt: now + DOWNLOAD_URL_HARD_TTL_MS,
  });
  persistUrlCache();
}

export function invalidateDownloadUrlCache(storageRefOrUrl: StorageReference | string): void {
  loadPersistentUrlCache();
  if (typeof storageRefOrUrl !== 'string') {
    downloadUrlMemoryCache.delete(getStorageCacheKey(storageRefOrUrl));
    persistUrlCache();
    return;
  }
  const directKey = `${storage.app.options.storageBucket || 'default'}/${storageRefOrUrl.replace(/^\/+/, '')}`;
  downloadUrlMemoryCache.delete(directKey);
  for (const [key, entry] of downloadUrlMemoryCache.entries()) {
    if (key.endsWith(`/${storageRefOrUrl}`) || entry.url === storageRefOrUrl) {
      downloadUrlMemoryCache.delete(key);
    }
  }
  persistUrlCache();
}

/**
 * Cache-aware Firebase Storage getDownloadURL wrapper:
 * - L1 in-memory LRU + L2 localStorage TTL cache (24h hard / 1h stale-while-revalidate)
 * - In-flight request deduplication so concurrent consumers never hit Storage twice
 */
export async function getCachedDownloadURL(
  storageRef: StorageReference,
  options?: { forceRefresh?: boolean }
): Promise<string> {
  loadPersistentUrlCache();
  const key = getStorageCacheKey(storageRef);
  const now = Date.now();

  if (!options?.forceRefresh) {
    const cached = downloadUrlMemoryCache.get(key);
    if (cached && cached.expiresAt > now) {
      downloadUrlMemoryCache.delete(key);
      downloadUrlMemoryCache.set(key, cached);

      if (now - cached.cachedAt > DOWNLOAD_URL_SOFT_TTL_MS && !inflightUrlLookups.has(key)) {
        const bgRefresh = getDownloadURL(storageRef)
          .then((freshUrl) => {
            const refreshedAt = Date.now();
            downloadUrlMemoryCache.delete(key);
            downloadUrlMemoryCache.set(key, {
              url: freshUrl,
              cachedAt: refreshedAt,
              expiresAt: refreshedAt + DOWNLOAD_URL_HARD_TTL_MS,
            });
            persistUrlCache();
            return freshUrl;
          })
          .catch(() => cached.url)
          .finally(() => {
            inflightUrlLookups.delete(key);
          });
        inflightUrlLookups.set(key, bgRefresh);
      }

      return cached.url;
    }
  }

  const inflight = inflightUrlLookups.get(key);
  if (inflight) return inflight;

  const fetchPromise = getDownloadURL(storageRef)
    .then((url) => {
      const resolvedAt = Date.now();
      downloadUrlMemoryCache.delete(key);
      downloadUrlMemoryCache.set(key, {
        url,
        cachedAt: resolvedAt,
        expiresAt: resolvedAt + DOWNLOAD_URL_HARD_TTL_MS,
      });
      persistUrlCache();
      return url;
    })
    .finally(() => {
      inflightUrlLookups.delete(key);
    });

  inflightUrlLookups.set(key, fetchPromise);
  return fetchPromise;
}

export async function resolveCachedMediaUrl(urlOrPath: string): Promise<string> {
  if (!urlOrPath) return '';
  if (urlOrPath.startsWith('/api/media/') || urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
    return urlOrPath;
  }
  const cleanPath = urlOrPath.replace(/^gs:\/\/[^/]+\//i, '').replace(/^\/+/, '');
  if (!cleanPath) return urlOrPath;
  return getCachedDownloadURL(ref(storage, cleanPath));
}

async function primeBrowserMediaCache(url: string, blob: Blob, mimeType: string): Promise<void> {
  if (!url || typeof caches === 'undefined' || blob.size > MEDIA_LIMITS.VIDEO_MAX_BYTES) return;
  try {
    const cache = await caches.open(MEDIA_CACHE_BUCKET);
    const response = new Response(blob, {
      status: 200,
      headers: {
        'Content-Type': mimeType || blob.type || 'application/octet-stream',
        'Cache-Control': STORAGE_CACHE_CONTROL,
      },
    });
    await cache.put(url, response);
  } catch {
    // Cache Storage may be unavailable in restricted contexts
  }
}

export async function prefetchMediaUrl(urlOrPath: string): Promise<void> {
  if (!urlOrPath || typeof window === 'undefined') return;
  let resolvedUrl = '';
  try {
    resolvedUrl = await resolveCachedMediaUrl(urlOrPath);
    if (!resolvedUrl || inflightPrefetches.has(resolvedUrl)) return;
    if (!/^(https?:\/\/|\/api\/media\/)/i.test(resolvedUrl)) return;

    inflightPrefetches.add(resolvedUrl);

    if (typeof caches !== 'undefined') {
      const cache = await caches.open(MEDIA_CACHE_BUCKET);
      const existing = await cache.match(resolvedUrl);
      if (existing) {
        return;
      }
      const resp = await fetch(resolvedUrl, { cache: 'force-cache' });
      if (resp.ok && resp.status === 200) {
        await cache.put(resolvedUrl, resp.clone());
      }
    } else {
      await fetch(resolvedUrl, { cache: 'force-cache' });
    }
  } catch {
    // Non-fatal speculative prefetch
  } finally {
    if (resolvedUrl) inflightPrefetches.delete(resolvedUrl);
    inflightPrefetches.delete(urlOrPath);
  }
}

export function warmMediaBatch(urls: Array<string | undefined | null>, maxItems = 4): void {
  if (typeof window === 'undefined') return;
  const targets = Array.from(
    new Set(urls.filter((u): u is string => typeof u === 'string' && u.length > 0))
  ).slice(0, maxItems);
  if (targets.length === 0) return;

  const schedule =
    typeof (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback ===
    'function'
      ? (window as Window & { requestIdleCallback: (cb: () => void) => number }).requestIdleCallback
      : (cb: () => void) => window.setTimeout(cb, 120);

  schedule(() => {
    targets.forEach((target) => {
      void prefetchMediaUrl(target);
    });
  });
}

export function inferMimeType(file: File): string {
  const raw = (file.type || '').split(';')[0].trim().toLowerCase();
  if (raw.startsWith('image/') || raw.startsWith('video/')) {
    return raw;
  }
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg'].includes(ext)) return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'avif') return 'image/avif';
  if (['heic', 'heif'].includes(ext)) return 'image/jpeg';
  if (['mp4', 'm4v'].includes(ext)) return 'video/mp4';
  if (ext === 'webm') return 'video/webm';
  if (ext === 'mov') return 'video/quicktime';
  if (ext === '3gp') return 'video/3gpp';
  if (ext === 'ogv') return 'video/ogg';
  return raw;
}

function sanitizeAllowedMime(mime: string, fallback: 'image/jpeg' | 'video/mp4'): string {
  const clean = mime.split(';')[0].trim().toLowerCase();
  if (/^(image|video)\/[a-zA-Z0-9.+-]+$/.test(clean) && clean.length <= 64) {
    return clean;
  }
  return fallback;
}

export function formatStorageError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';
  if (code === 'storage/unauthorized') {
    return 'Upload blocked by Firebase Storage permissions.';
  }
  if (code === 'storage/bucket-not-found' || code === 'storage/project-not-found') {
    return 'Firebase Storage bucket is not activated yet.';
  }
  if (code === 'storage/canceled') {
    return 'Upload was canceled.';
  }
  return error instanceof Error ? error.message : 'Media upload failed. Please try again.';
}

export function validateImageFile(file: File): void {
  const mime = inferMimeType(file);
  if (!mime.startsWith('image/')) {
    throw new Error('Please choose a valid image file (PNG, JPG, WebP, or GIF).');
  }
  if (file.size > MEDIA_LIMITS.IMAGE_MAX_BYTES) {
    throw new Error('Image must be 10MB or smaller.');
  }
}

export function validateVideoFile(file: File): void {
  const mime = inferMimeType(file);
  if (!mime.startsWith('video/')) {
    throw new Error('Please choose a valid video file (MP4, WebM, or MOV).');
  }
  if (file.size > MEDIA_LIMITS.VIDEO_MAX_BYTES) {
    throw new Error('Video must be 50MB or smaller.');
  }
}

function supportsWebpEncode(): boolean {
  if (webpSupportCached !== null) return webpSupportCached;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 2;
    webpSupportCached = canvas.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    webpSupportCached = false;
  }
  return webpSupportCached;
}

export interface ImageCompressionOptions {
  maxDim?: number;
  quality?: number;
  targetMaxBytes?: number;
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mime, quality);
  });
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to decode image.'));
    };
    img.src = objectUrl;
  });
}

export async function compressImageFile(
  file: File,
  maxDimOrOptions: number | ImageCompressionOptions = 1280
): Promise<Blob> {
  const mime = inferMimeType(file);
  if (mime === 'image/gif') return file;

  const opts: ImageCompressionOptions =
    typeof maxDimOrOptions === 'number' ? { maxDim: maxDimOrOptions } : maxDimOrOptions;
  const maxDim = opts.maxDim ?? 1280;
  const baseQuality = opts.quality ?? 0.8;
  const targetMaxBytes = opts.targetMaxBytes ?? 500_000;
  const outputMime = supportsWebpEncode() ? 'image/webp' : 'image/jpeg';

  const compressTask = async (): Promise<Blob> => {
    let bitmap: ImageBitmap | null = null;
    let source: CanvasImageSource;
    let srcW = 0;
    let srcH = 0;

    try {
      if (typeof createImageBitmap === 'function') {
        try {
          bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
          source = bitmap;
          srcW = bitmap.width;
          srcH = bitmap.height;
        } catch {
          const img = await loadImageElement(file);
          source = img;
          srcW = img.naturalWidth || img.width;
          srcH = img.naturalHeight || img.height;
        }
      } else {
        const img = await loadImageElement(file);
        source = img;
        srcW = img.naturalWidth || img.width;
        srcH = img.naturalHeight || img.height;
      }

      if (!srcW || !srcH) return file;

      let width = srcW;
      let height = srcH;
      if (width > maxDim || height > maxDim) {
        if (width >= height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, width);
      canvas.height = Math.max(1, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) return file;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

      let bestBlob = await canvasToBlob(canvas, outputMime, baseQuality);
      if (bestBlob && bestBlob.size > targetMaxBytes) {
        const tighter = await canvasToBlob(canvas, outputMime, Math.max(0.58, baseQuality - 0.14));
        if (tighter && tighter.size < bestBlob.size) {
          bestBlob = tighter;
        }
      }

      if (bestBlob && bestBlob.size < file.size) {
        return bestBlob;
      }
      return file;
    } catch {
      return file;
    } finally {
      bitmap?.close();
    }
  };

  return Promise.race([
    compressTask(),
    new Promise<Blob>((resolve) => window.setTimeout(() => resolve(file), 3000)),
  ]);
}

export async function generateVideoThumbnailAndDuration(
  file: File
): Promise<{ thumbnailBlob: Blob | null; durationSec: number }> {
  return new Promise((resolve) => {
    let settled = false;
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    const objectUrl = URL.createObjectURL(file);

    const finish = (result: { thumbnailBlob: Blob | null; durationSec: number }) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      video.onloadedmetadata = null;
      video.onloadeddata = null;
      video.onseeked = null;
      video.onerror = null;
      URL.revokeObjectURL(objectUrl);
      resolve(result);
    };

    const timer = window.setTimeout(() => {
      const durationSec = Number.isFinite(video.duration)
        ? Math.min(7200, Math.round(video.duration))
        : 0;
      finish({ thumbnailBlob: null, durationSec });
    }, 2200);

    let captured = false;
    const captureFrame = () => {
      if (captured || settled) return;
      captured = true;
      const durationSec = Number.isFinite(video.duration)
        ? Math.min(7200, Math.round(video.duration))
        : 0;
      try {
        const canvas = document.createElement('canvas');
        const vw = video.videoWidth || 720;
        const vh = video.videoHeight || 1280;
        const scale = Math.min(1, 540 / Math.max(vw, vh));
        canvas.width = Math.max(1, Math.round(vw * scale));
        canvas.height = Math.max(1, Math.round(vh * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          finish({ thumbnailBlob: null, durationSec });
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const thumbMime = supportsWebpEncode() ? 'image/webp' : 'image/jpeg';
        canvas.toBlob(
          (blob) => {
            finish({ thumbnailBlob: blob, durationSec });
          },
          thumbMime,
          0.74
        );
      } catch {
        finish({ thumbnailBlob: null, durationSec });
      }
    };

    video.onloadeddata = () => {
      try {
        const targetTime = Math.min(0.8, Math.max(0.05, (video.duration || 1) * 0.1));
        video.currentTime = targetTime;
      } catch {
        captureFrame();
      }
    };

    video.onseeked = captureFrame;
    video.onerror = () => finish({ thumbnailBlob: null, durationSec: 0 });
    video.src = objectUrl;
  });
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + step)));
  }
  return btoa(parts.join(''));
}

async function uploadBlobToFirestoreMedia(
  blob: Blob,
  mimeType: string,
  uid: string,
  onProgress?: (percent: number) => void,
  lifecycle?: UploadLifecycleOptions
): Promise<string> {
  if (blob.size <= 0) {
    throw new Error('Selected file is empty.');
  }
  if (blob.size > MEDIA_LIMITS.FALLBACK_MAX_BYTES) {
    throw new Error(
      'Video exceeds the 23.8 MB direct upload fallback limit. Please ensure Firebase Storage is available for files up to 50 MB.'
    );
  }

  let canceled = false;
  let paused = false;
  let currentPct = 2;
  let transferredBytes = 0;
  const resumeResolvers: Array<() => void> = [];

  lifecycle?.onControl?.({
    pause: () => {
      paused = true;
      return true;
    },
    resume: () => {
      paused = false;
      while (resumeResolvers.length > 0) {
        resumeResolvers.shift()?.();
      }
      return true;
    },
    cancel: () => {
      canceled = true;
      paused = false;
      while (resumeResolvers.length > 0) {
        resumeResolvers.shift()?.();
      }
    },
  });

  const waitIfPaused = async () => {
    if (canceled) throw new Error('Upload was canceled.');
    if (!paused) return;
    lifecycle?.onDetail?.({
      stage: 'paused',
      percent: currentPct,
      bytesTransferred: transferredBytes,
      totalBytes: blob.size,
      speedBytesPerSec: null,
      etaSeconds: null,
    });
    await new Promise<void>((resolve) => {
      resumeResolvers.push(resolve);
    });
    if (canceled) throw new Error('Upload was canceled.');
  };

  const startedAt = Date.now();
  let emaSpeed: number | null = null;
  let lastTickAt = startedAt;
  let lastTickBytes = 0;

  onProgress?.(2);
  lifecycle?.onDetail?.({
    stage: 'preparing',
    percent: 2,
    bytesTransferred: 0,
    totalBytes: blob.size,
    speedBytesPerSec: null,
    etaSeconds: null,
  });

  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const chunkCount = Math.max(1, Math.ceil(bytes.length / CHUNK_RAW_BYTES));
  const assetRef = doc(collection(db, 'mediaAssets'));
  const assetId = assetRef.id;

  await waitIfPaused();

  await setDoc(assetRef, {
    id: assetId,
    ownerId: uid,
    mimeType,
    byteLength: bytes.length,
    chunkCount,
    createdAt: serverTimestamp(),
  });

  currentPct = 8;
  onProgress?.(8);

  let nextIdx = 0;
  let completedChunks = 0;
  const workerCount = Math.min(UPLOAD_WORKER_CONCURRENCY, chunkCount);

  const runWorker = async () => {
    while (nextIdx < chunkCount) {
      await waitIfPaused();
      const idx = nextIdx;
      nextIdx += 1;
      const byteStart = idx * CHUNK_RAW_BYTES;
      const byteEnd = Math.min(bytes.length, byteStart + CHUNK_RAW_BYTES);
      const base64Data = uint8ArrayToBase64(bytes.subarray(byteStart, byteEnd));
      const chunkId = `c_${idx}`;
      const chunkRef = doc(db, 'mediaAssets', assetId, 'chunks', chunkId);

      await setDoc(chunkRef, {
        id: chunkId,
        assetId,
        ownerId: uid,
        index: idx,
        data: base64Data,
        createdAt: serverTimestamp(),
      });

      completedChunks += 1;
      transferredBytes = Math.min(bytes.length, transferredBytes + (byteEnd - byteStart));
      const now = Date.now();
      const dtSec = Math.max(0.05, (now - lastTickAt) / 1000);
      const deltaBytes = transferredBytes - lastTickBytes;
      if (deltaBytes > 0) {
        const instSpeed = deltaBytes / dtSec;
        emaSpeed = emaSpeed === null ? instSpeed : emaSpeed * 0.65 + instSpeed * 0.35;
        lastTickAt = now;
        lastTickBytes = transferredBytes;
      }

      const elapsedMs = now - startedAt;
      const remaining = Math.max(0, bytes.length - transferredBytes);
      const eta =
        elapsedMs >= 1200 && emaSpeed && emaSpeed > 1024
          ? Math.max(1, Math.ceil(remaining / emaSpeed))
          : null;

      currentPct = Math.min(98, 8 + Math.round((completedChunks / chunkCount) * 90));
      onProgress?.(currentPct);
      lifecycle?.onDetail?.({
        stage: paused ? 'paused' : 'uploading',
        percent: currentPct,
        bytesTransferred: transferredBytes,
        totalBytes: bytes.length,
        speedBytesPerSec: elapsedMs >= 1200 ? emaSpeed : null,
        etaSeconds: eta,
      });
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  onProgress?.(100);
  lifecycle?.onDetail?.({
    stage: 'completed',
    percent: 100,
    bytesTransferred: bytes.length,
    totalBytes: bytes.length,
    speedBytesPerSec: emaSpeed,
    etaSeconds: 0,
  });
  const mediaUrl = `/api/media/${assetId}`;
  void primeBrowserMediaCache(mediaUrl, blob, mimeType);
  return mediaUrl;
}

class StorageUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageUnavailableError';
  }
}

class UploadCanceledError extends Error {
  constructor() {
    super('Upload was canceled.');
    this.name = 'UploadCanceledError';
  }
}

/**
 * Direct resumable Firebase Storage upload:
 * - Single CDN object supporting native HTTP/2 multiplexing, resumable pause/resume, and edge Range streaming
 * - Tracks genuine transfer speed (EMA bytes/sec) and real ETA
 */
async function uploadResumableToFirebaseStorage(
  blob: Blob,
  storagePath: string,
  contentType: string,
  lifecycle?: UploadLifecycleOptions,
  onBytesProgress?: (bytesTransferred: number, totalBytes: number) => void
): Promise<string> {
  const storageRef = ref(storage, storagePath);
  const task: UploadTask = uploadBytesResumable(storageRef, blob, {
    contentType,
    cacheControl: STORAGE_CACHE_CONTROL,
  });

  let userCanceled = false;
  let lastBytes = 0;
  let lastPercent = 0;
  let emaSpeed: number | null = null;
  let lastSampleTime = Date.now();
  let lastSampleBytes = 0;
  const startedAt = Date.now();

  lifecycle?.onControl?.({
    pause: () => task.pause(),
    resume: () => task.resume(),
    cancel: () => {
      userCanceled = true;
      task.cancel();
    },
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    let isPaused = false;

    const finishError = (err: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(stallTimer);
      reject(err);
    };

    const stallTimer = window.setTimeout(() => {
      if (settled || lastBytes > 0 || isPaused || userCanceled) return;
      task.cancel();
      finishError(new StorageUnavailableError('Firebase Storage timed out on initial handshake.'));
    }, STORAGE_STALL_MS);

    task.on(
      'state_changed',
      (snapshot) => {
        const total = Math.max(1, snapshot.totalBytes || blob.size);
        lastBytes = snapshot.bytesTransferred;
        isPaused = snapshot.state === 'paused';

        if (lastBytes > 0) {
          window.clearTimeout(stallTimer);
        }

        const now = Date.now();
        const dtSec = (now - lastSampleTime) / 1000;
        if (dtSec >= 0.35 && lastBytes > lastSampleBytes) {
          const instSpeed = (lastBytes - lastSampleBytes) / dtSec;
          emaSpeed = emaSpeed === null ? instSpeed : emaSpeed * 0.65 + instSpeed * 0.35;
          lastSampleTime = now;
          lastSampleBytes = lastBytes;
        }

        const pct = Math.min(99, Math.round((lastBytes / total) * 100));
        lastPercent = pct;
        onBytesProgress?.(lastBytes, total);

        const elapsedMs = now - startedAt;
        const remaining = Math.max(0, total - lastBytes);
        const eta =
          !isPaused && elapsedMs >= 1200 && emaSpeed && emaSpeed > 1024
            ? Math.max(1, Math.ceil(remaining / emaSpeed))
            : null;

        lifecycle?.onDetail?.({
          stage: isPaused ? 'paused' : 'uploading',
          percent: pct,
          bytesTransferred: lastBytes,
          totalBytes: total,
          speedBytesPerSec: !isPaused && elapsedMs >= 1200 ? emaSpeed : null,
          etaSeconds: eta,
        });
      },
      (error) => {
        if (userCanceled) {
          finishError(new UploadCanceledError());
          return;
        }
        const code =
          typeof error === 'object' && error !== null && 'code' in error
            ? String((error as { code: unknown }).code)
            : '';

        if (
          code === 'storage/bucket-not-found' ||
          code === 'storage/project-not-found' ||
          code === 'storage/unauthorized'
        ) {
          markStorageUnavailable();
          finishError(new StorageUnavailableError(formatStorageError(error)));
          return;
        }

        if (code === 'storage/retry-limit-exceeded' && lastBytes === 0) {
          finishError(new StorageUnavailableError(formatStorageError(error)));
          return;
        }

        lifecycle?.onDetail?.({
          stage: 'failed',
          percent: lastPercent,
          bytesTransferred: lastBytes,
          totalBytes: blob.size,
          speedBytesPerSec: null,
          etaSeconds: null,
        });
        finishError(new Error(formatStorageError(error)));
      },
      async () => {
        if (settled) return;
        window.clearTimeout(stallTimer);
        try {
          const url = await getCachedDownloadURL(task.snapshot.ref);
          settled = true;
          lifecycle?.onDetail?.({
            stage: 'completed',
            percent: 100,
            bytesTransferred: blob.size,
            totalBytes: blob.size,
            speedBytesPerSec: emaSpeed,
            etaSeconds: 0,
          });
          resolve(url);
        } catch (err) {
          finishError(new Error(formatStorageError(err)));
        }
      }
    );
  });
}

export async function uploadBlobWithFallback(
  blob: Blob,
  storagePath: string,
  contentType: string,
  uid: string,
  onProgress?: (percent: number) => void,
  lifecycle?: UploadLifecycleOptions
): Promise<string> {
  if (!isStorageMarkedUnavailable()) {
    try {
      const url = await uploadResumableToFirebaseStorage(
        blob,
        storagePath,
        contentType,
        lifecycle,
        (transferred, total) => {
          onProgress?.(Math.min(99, Math.round((transferred / Math.max(1, total)) * 100)));
        }
      );
      onProgress?.(100);
      void primeBrowserMediaCache(url, blob, contentType);
      return url;
    } catch (err) {
      if (err instanceof UploadCanceledError) {
        throw err;
      }
      if (!(err instanceof StorageUnavailableError) && blob.size > MEDIA_LIMITS.FALLBACK_MAX_BYTES) {
        throw err;
      }
    }
  }
  return uploadBlobToFirestoreMedia(blob, contentType, uid, onProgress, lifecycle);
}

function getCompressionPreset(folderPrefix: string): ImageCompressionOptions {
  if (folderPrefix === 'av') {
    return { maxDim: 512, quality: 0.8, targetMaxBytes: 180_000 };
  }
  if (folderPrefix === 'cv') {
    return { maxDim: 1440, quality: 0.8, targetMaxBytes: 550_000 };
  }
  return { maxDim: 1280, quality: 0.8, targetMaxBytes: 500_000 };
}

export async function uploadImageAsset(
  file: File,
  folderPrefix: string,
  uid: string,
  onProgress?: (percent: number) => void,
  compressionOptions?: ImageCompressionOptions,
  lifecycle?: UploadLifecycleOptions
): Promise<string> {
  validateImageFile(file);
  onProgress?.(3);
  lifecycle?.onDetail?.({
    stage: 'preparing',
    percent: 3,
    bytesTransferred: 0,
    totalBytes: file.size,
    speedBytesPerSec: null,
    etaSeconds: null,
  });

  const preset = { ...getCompressionPreset(folderPrefix), ...compressionOptions };
  const compressed = await compressImageFile(file, preset);
  const inferred = inferMimeType(file);
  const contentType = sanitizeAllowedMime(
    compressed.type || (inferred.startsWith('image/') ? inferred : 'image/jpeg'),
    'image/jpeg'
  );
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const ext =
    contentType === 'image/gif' ? 'gif' : contentType === 'image/webp' ? 'webp' : 'jpg';
  const path = `${folderPrefix}/${uid}/${id}.${ext}`;
  return uploadBlobWithFallback(compressed, path, contentType, uid, onProgress, lifecycle);
}

export async function uploadVideoAsset(
  file: File,
  folderPrefix: string,
  uid: string,
  onProgress?: (percent: number) => void,
  lifecycle?: UploadLifecycleOptions
): Promise<{ videoUrl: string; thumbnailUrl: string; durationSec: number }> {
  validateVideoFile(file);
  onProgress?.(2);
  lifecycle?.onDetail?.({
    stage: 'preparing',
    percent: 2,
    bytesTransferred: 0,
    totalBytes: file.size,
    speedBytesPerSec: null,
    etaSeconds: null,
  });

  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const ext = file.name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6) || 'mp4';
  const contentType = sanitizeAllowedMime(inferMimeType(file), 'video/mp4');
  const storagePath = `${folderPrefix}/${uid}/${id}.${ext}`;

  // Upload primary video file immediately while extracting thumbnail concurrently in parallel
  const [videoUrl, meta] = await Promise.all([
    uploadBlobWithFallback(file, storagePath, contentType, uid, onProgress, lifecycle),
    generateVideoThumbnailAndDuration(file),
  ]);

  let thumbnailUrl = '';
  if (meta.thumbnailBlob) {
    const thumbMime = sanitizeAllowedMime(meta.thumbnailBlob.type || 'image/jpeg', 'image/jpeg');
    const thumbExt = thumbMime === 'image/webp' ? 'webp' : 'jpg';
    try {
      thumbnailUrl = await uploadBlobWithFallback(
        meta.thumbnailBlob,
        `${folderPrefix}/${uid}/${id}_thumb.${thumbExt}`,
        thumbMime,
        uid
      );
    } catch {
      thumbnailUrl = '';
    }
  }

  return { videoUrl, thumbnailUrl, durationSec: meta.durationSec };
}

function extensionFromMime(mime: string, url: string): string {
  const clean = (mime || '').split(';')[0].trim().toLowerCase();
  if (clean === 'image/jpeg') return 'jpg';
  if (clean === 'image/png') return 'png';
  if (clean === 'image/webp') return 'webp';
  if (clean === 'image/gif') return 'gif';
  if (clean === 'image/avif') return 'avif';
  if (clean === 'video/mp4') return 'mp4';
  if (clean === 'video/webm') return 'webm';
  if (clean === 'video/quicktime') return 'mov';
  if (clean === 'video/ogg') return 'ogv';
  const urlExt = url.split('?')[0].split('.').pop()?.toLowerCase() || '';
  if (/^[a-z0-9]{2,5}$/.test(urlExt)) return urlExt;
  return 'bin';
}

function triggerBlobDownload(blob: Blob, filenameBase: string, url: string): void {
  const ext = extensionFromMime(blob.type, url);
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = `${filenameBase}.${ext}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
}

/**
 * Deduplicated, cache-aware, streaming media download:
 * 1. Reuses in-memory preloaded Blob if already buffered (instant save)
 * 2. Reuses Browser CacheStorage hit if present
 * 3. Streams via ReadableStream with genuine byte-level progress and saves to CacheStorage
 * 4. Prevents duplicate concurrent downloads of the same URL
 */
export async function downloadMediaFile(
  urlOrPath: string,
  filenameBase = 'ainemax_media',
  options?: DownloadMediaOptions
): Promise<void> {
  const url = await resolveCachedMediaUrl(urlOrPath);
  if (!url || !/^(https?:\/\/|\/api\/media\/)/i.test(url)) {
    throw new Error('Unsupported media download URL.');
  }
  const safeBase =
    filenameBase
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48) || 'ainemax_media';

  const existing = inflightDownloads.get(url);
  if (existing) {
    if (options?.onProgress) {
      existing.listeners.add(options.onProgress);
    }
    try {
      await existing.promise;
    } finally {
      if (options?.onProgress) {
        existing.listeners.delete(options.onProgress);
      }
    }
    return;
  }

  const listeners = new Set<(info: DownloadProgressInfo) => void>();
  if (options?.onProgress) listeners.add(options.onProgress);
  const emit = (info: DownloadProgressInfo) => {
    listeners.forEach((cb) => {
      try {
        cb(info);
      } catch {
        // Ignore listener error
      }
    });
  };

  const taskPromise = (async () => {
    emit({ percent: 0, receivedBytes: 0, totalBytes: null });

    // 1. Instant zero-network save if already in videoPreloadService memory pool
    const memoryBlob = preloadedBlobResolver?.(urlOrPath) || preloadedBlobResolver?.(url);
    if (memoryBlob && memoryBlob.size > 0) {
      emit({ percent: 100, receivedBytes: memoryBlob.size, totalBytes: memoryBlob.size });
      triggerBlobDownload(memoryBlob, safeBase, url);
      return;
    }

    try {
      // 2. Check Browser CacheStorage
      if (typeof caches !== 'undefined') {
        try {
          const cache = await caches.open(MEDIA_CACHE_BUCKET);
          const cachedResp = await cache.match(url);
          if (cachedResp && cachedResp.ok) {
            const cachedBlob = await cachedResp.blob();
            if (cachedBlob.size > 0) {
              emit({ percent: 100, receivedBytes: cachedBlob.size, totalBytes: cachedBlob.size });
              triggerBlobDownload(cachedBlob, safeBase, url);
              return;
            }
          }
        } catch {
          // CacheStorage inaccessible
        }
      }

      // 3. Stream over network with byte-accurate progress
      const resp = await fetch(url, {
        cache: 'force-cache',
        signal: options?.signal,
      });
      if (!resp.ok) {
        throw new Error(`Download failed (HTTP ${resp.status}).`);
      }

      const contentLengthHeader = resp.headers.get('content-length');
      const totalBytes =
        contentLengthHeader && Number(contentLengthHeader) > 0 ? Number(contentLengthHeader) : null;
      const mimeType = resp.headers.get('content-type') || 'application/octet-stream';

      let blob: Blob;
      if (resp.body && typeof resp.body.getReader === 'function') {
        const reader = resp.body.getReader();
        const chunks: BlobPart[] = [];
        let receivedBytes = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value && value.byteLength > 0) {
            chunks.push(value);
            receivedBytes += value.byteLength;
            const percent =
              totalBytes && totalBytes > 0
                ? Math.min(99, Math.round((receivedBytes / totalBytes) * 100))
                : null;
            emit({ percent, receivedBytes, totalBytes });
          }
        }
        blob = new Blob(chunks, { type: mimeType });
      } else {
        blob = await resp.blob();
      }

      emit({ percent: 100, receivedBytes: blob.size, totalBytes: blob.size });
      void primeBrowserMediaCache(url, blob, mimeType);
      triggerBlobDownload(blob, safeBase, url);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }

      // 4. Direct server/CDN download fallback without opening a blank viewer tab
      const directHref = url.startsWith('/api/media/')
        ? `${url}${url.includes('?') ? '&' : '?'}download=1&filename=${encodeURIComponent(safeBase)}`
        : url;

      const anchor = document.createElement('a');
      anchor.href = directHref;
      anchor.download = safeBase;
      anchor.rel = 'noopener noreferrer';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      emit({ percent: 100, receivedBytes: 0, totalBytes: null });
    }
  })().finally(() => {
    inflightDownloads.delete(url);
  });

  inflightDownloads.set(url, { promise: taskPromise, listeners });
  return taskPromise;
}
