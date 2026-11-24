import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import {
  createLiveKitTokenRouter,
  readServerLiveKitCredentials,
} from './server/livekitTokenMiddleware';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

interface FirebaseConfig {
  apiKey?: string;
  projectId?: string;
  firestoreDatabaseId?: string;
}

function loadFirebaseWebConfig(): FirebaseConfig {
  try {
    const raw = fs.readFileSync(path.resolve(__dirname, 'firebase-applet-config.json'), 'utf8');
    return JSON.parse(raw) as FirebaseConfig;
  } catch {
    return {};
  }
}

const firebaseConfig = loadFirebaseWebConfig();

// Lightweight in-memory rate limiter for /api/* routes
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function apiRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + 60_000 });
    next();
    return;
  }
  if (bucket.count >= 90) {
    res.status(429).json({ error: 'Too many API requests. Please wait a moment.' });
    return;
  }
  bucket.count += 1;
  next();
}

async function createServer() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    next();
  });
  app.use(express.json({ limit: '256kb' }));
  app.use('/api', (req, res, next) => {
    if (req.path.startsWith('/media/')) {
      next();
      return;
    }
    apiRateLimiter(req, res, next);
  });

  app.get('/api/health', (_req, res) => {
    const lk = readServerLiveKitCredentials();
    res.json({
      ok: true,
      service: 'ainemax',
      livekitConfigured: lk.configured,
    });
  });

  // Bounded LRU cache (<= 128 MB) + in-flight deduplication for ultra-fast media streaming
  interface CachedMediaEntry {
    buffer: Buffer;
    mimeType: string;
  }
  const mediaCache = new Map<string, CachedMediaEntry>();
  const inflightMediaLoads = new Map<string, Promise<CachedMediaEntry | null>>();
  let mediaCacheBytes = 0;
  const MAX_MEDIA_CACHE_BYTES = 128 * 1024 * 1024;
  const MAX_MEDIA_ENTRY_BYTES = 52 * 1024 * 1024;

  const getMediaCache = (assetId: string): CachedMediaEntry | undefined => {
    const hit = mediaCache.get(assetId);
    if (!hit) return undefined;
    // Refresh LRU order
    mediaCache.delete(assetId);
    mediaCache.set(assetId, hit);
    return hit;
  };

  const setMediaCache = (assetId: string, entry: CachedMediaEntry) => {
    if (entry.buffer.length > MAX_MEDIA_ENTRY_BYTES) return;
    const existing = mediaCache.get(assetId);
    if (existing) {
      mediaCache.delete(assetId);
      mediaCacheBytes -= existing.buffer.length;
    }
    while (mediaCacheBytes + entry.buffer.length > MAX_MEDIA_CACHE_BYTES && mediaCache.size > 0) {
      const oldestKey = mediaCache.keys().next().value;
      if (!oldestKey) break;
      const old = mediaCache.get(oldestKey);
      mediaCache.delete(oldestKey);
      if (old) mediaCacheBytes -= old.buffer.length;
    }
    mediaCache.set(assetId, entry);
    mediaCacheBytes += entry.buffer.length;
  };

  interface FirestoreRestValue {
    stringValue?: string;
    integerValue?: string;
    arrayValue?: {
      values?: Array<{ stringValue?: string }>;
    };
  }

  interface FirestoreRestDoc {
    fields?: Record<string, FirestoreRestValue>;
  }

  const fetchFirestoreRestDoc = async (docPath: string): Promise<FirestoreRestDoc | null> => {
    if (!firebaseConfig.projectId || !firebaseConfig.apiKey) return null;
    const dbId = firebaseConfig.firestoreDatabaseId || '(default)';
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      firebaseConfig.projectId
    )}/databases/${encodeURIComponent(dbId)}/documents/${docPath}?key=${encodeURIComponent(
      firebaseConfig.apiKey
    )}`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    return (await resp.json()) as FirestoreRestDoc;
  };

  const isAllowedStoragePartUrl = (rawUrl: string): boolean => {
    try {
      const parsed = new URL(rawUrl);
      return parsed.protocol === 'https:' && parsed.hostname === 'firebasestorage.googleapis.com';
    } catch {
      return false;
    }
  };

  const loadMediaAsset = async (assetId: string): Promise<CachedMediaEntry | null> => {
    const cached = getMediaCache(assetId);
    if (cached) return cached;

    const existingPromise = inflightMediaLoads.get(assetId);
    if (existingPromise) return existingPromise;

    const loadPromise = (async (): Promise<CachedMediaEntry | null> => {
      const meta = await fetchFirestoreRestDoc(`mediaAssets/${encodeURIComponent(assetId)}`);
      const mimeType = meta?.fields?.mimeType?.stringValue || 'application/octet-stream';
      const chunkCount = Number(meta?.fields?.chunkCount?.integerValue || '0');
      const storagePartValues = meta?.fields?.storagePartUrls?.arrayValue?.values;

      if (Array.isArray(storagePartValues) && storagePartValues.length > 0) {
        const partUrls = storagePartValues
          .map((v) => v.stringValue || '')
          .filter((u) => isAllowedStoragePartUrl(u));
        if (partUrls.length === 0 || partUrls.length !== storagePartValues.length || partUrls.length > 20) {
          return null;
        }
        const partBuffers: Buffer[] = new Array(partUrls.length);
        let nextIdx = 0;
        let failedPart = false;
        const workerCount = Math.min(8, partUrls.length);

        const partWorker = async () => {
          while (nextIdx < partUrls.length && !failedPart) {
            const i = nextIdx;
            nextIdx += 1;
            const partResp = await fetch(partUrls[i]);
            if (!partResp.ok) {
              failedPart = true;
              return;
            }
            const ab = await partResp.arrayBuffer();
            partBuffers[i] = Buffer.from(ab);
          }
        };

        await Promise.all(Array.from({ length: workerCount }, () => partWorker()));
        if (failedPart) return null;

        const entry: CachedMediaEntry = {
          buffer: Buffer.concat(partBuffers),
          mimeType,
        };
        setMediaCache(assetId, entry);
        return entry;
      }

      if (!meta?.fields || !Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > 48) {
        return null;
      }

      const chunkBuffers: Buffer[] = new Array(chunkCount);
      let nextIdx = 0;
      let missingChunk = false;
      const workerCount = Math.min(16, chunkCount);

      const worker = async () => {
        while (nextIdx < chunkCount && !missingChunk) {
          const i = nextIdx;
          nextIdx += 1;
          const docData = await fetchFirestoreRestDoc(
            `mediaAssets/${encodeURIComponent(assetId)}/chunks/c_${i}`
          );
          const b64 = docData?.fields?.data?.stringValue;
          if (!b64) {
            missingChunk = true;
            return;
          }
          chunkBuffers[i] = Buffer.from(b64, 'base64');
        }
      };

      await Promise.all(Array.from({ length: workerCount }, () => worker()));
      if (missingChunk) return null;

      const entry: CachedMediaEntry = {
        buffer: Buffer.concat(chunkBuffers),
        mimeType,
      };
      setMediaCache(assetId, entry);
      return entry;
    })().finally(() => {
      inflightMediaLoads.delete(assetId);
    });

    inflightMediaLoads.set(assetId, loadPromise);
    return loadPromise;
  };

  app.get('/api/media/:assetId', async (req, res) => {
    const { assetId } = req.params;
    if (!/^[a-zA-Z0-9_-]{3,128}$/.test(assetId)) {
      res.status(400).json({ error: 'Invalid media ID.' });
      return;
    }

    const etag = `"${assetId}"`;
    if (req.headers['if-none-match'] === etag && !req.headers.range) {
      res.status(304).end();
      return;
    }

    try {
      const loaded = await loadMediaAsset(assetId);
      if (!loaded) {
        res.status(404).json({ error: 'Media asset not found.' });
        return;
      }

      const { buffer, mimeType } = loaded;
      const total = buffer.length;
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

      if (req.query.download === '1') {
        const rawName = typeof req.query.filename === 'string' ? req.query.filename : `ainemax_${assetId}`;
        const safeName =
          rawName.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64) ||
          `ainemax_${assetId}`;
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
      }

      const rangeHeader = req.headers.range;
      if (rangeHeader) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
        if (!match) {
          res.status(416).setHeader('Content-Range', `bytes */${total}`).end();
          return;
        }
        const start = match[1] ? parseInt(match[1], 10) : 0;
        const end = match[2] ? Math.min(total - 1, parseInt(match[2], 10)) : total - 1;
        if (start >= total || start > end || Number.isNaN(start) || Number.isNaN(end)) {
          res.status(416).setHeader('Content-Range', `bytes */${total}`).end();
          return;
        }
        const slice = buffer.subarray(start, end + 1);
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
        res.setHeader('Content-Length', String(slice.length));
        res.end(slice);
        return;
      }

      res.status(200);
      res.setHeader('Content-Length', String(total));
      res.end(buffer);
    } catch {
      res.status(500).json({ error: 'Failed to load media asset.' });
    }
  });

  app.use(
    '/api/livekit',
    createLiveKitTokenRouter({
      firebaseApiKey: firebaseConfig.apiKey,
      fetchLiveStreamDoc: async (roomId: string) => {
        const streamDoc = await fetchFirestoreRestDoc(`liveStreams/${encodeURIComponent(roomId)}`);
        if (!streamDoc?.fields) return null;
        return {
          hostId: streamDoc.fields.hostId?.stringValue || '',
          status: streamDoc.fields.status?.stringValue || '',
        };
      },
    })
  );

  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer },
        hmr: hmrDisabled ? false : { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(
      express.static(distDir, {
        setHeaders(res, filePath) {
          if (
            filePath.endsWith('sw.js') ||
            filePath.endsWith('firebase-messaging-sw.js') ||
            filePath.endsWith('registerSW.js') ||
            filePath.endsWith('index.html')
          ) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          } else if (filePath.endsWith('.webmanifest')) {
            res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
            res.setHeader('Cache-Control', 'public, max-age=3600');
          } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      })
    );
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'API endpoint not found.' });
        return;
      }
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`AINEMAX server listening on port ${PORT}`);
  });
}

void createServer();
