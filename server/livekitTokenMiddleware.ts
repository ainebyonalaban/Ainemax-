import crypto from 'crypto';
import express, { NextFunction, Request, Response, Router } from 'express';
import { AccessToken } from 'livekit-server-sdk';

export interface VerifiedFirebaseUser {
  uid: string;
  email?: string;
  displayName?: string;
}

export interface LiveKitMiddlewareDeps {
  firebaseApiKey?: string;
  fetchLiveStreamDoc: (
    roomId: string
  ) => Promise<{ hostId: string; status: string } | null>;
}

export interface LiveKitVerificationState {
  checkedAt: number;
  fingerprint: string;
  configured: boolean;
  verified: boolean;
  livekitUrl: string | null;
  errorCode: string | null;
  error: string | null;
}

interface VerifiedLocals {
  verifiedUser?: VerifiedFirebaseUser;
}

const ROOM_ID_PATTERN = /^[a-zA-Z0-9_-]{3,128}$/;
const JWT_SHAPE_PATTERN = /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/;

function normalizeLiveKitUrl(raw?: string): string | null {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;
  const match = trimmed.match(/wss?:\/\/[^\s"'<>]+/i);
  if (!match) return null;
  try {
    const parsed = new URL(match[0]);
    if (parsed.protocol !== 'wss:' && parsed.protocol !== 'ws:') return null;
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function sanitizeLiveKitCredential(raw: string | undefined, varName: string): string {
  let val = (raw || '').replace(/[\u200B-\u200D\uFEFF\r\n]/g, '').trim();
  const envPrefixRegex = new RegExp(`^(?:export\\s+)?${varName}\\s*=\\s*`, 'i');
  val = val.replace(envPrefixRegex, '').trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'")) ||
    (val.startsWith('`') && val.endsWith('`'))
  ) {
    val = val.slice(1, -1).trim();
  }
  return val;
}

export function readServerLiveKitCredentials(): {
  configured: boolean;
  url: string | null;
  apiKey: string;
  apiSecret: string;
} {
  if (typeof window !== 'undefined') {
    throw new Error('LiveKit credentials may only be read on the Node.js server.');
  }
  const url = normalizeLiveKitUrl(process.env.LIVEKIT_URL);
  const apiKey = sanitizeLiveKitCredential(process.env.LIVEKIT_API_KEY, 'LIVEKIT_API_KEY');
  const apiSecret = sanitizeLiveKitCredential(
    process.env.LIVEKIT_API_SECRET,
    'LIVEKIT_API_SECRET'
  );
  return {
    configured: Boolean(url && apiKey && apiSecret),
    url,
    apiKey,
    apiSecret,
  };
}

export async function createLiveKitAccessToken(params: {
  identity: string;
  name: string;
  room: string;
  canPublish: boolean;
  canSubscribe?: boolean;
  ttlSeconds?: number;
}): Promise<{ jwt: string; livekitUrl: string }> {
  const { configured, url, apiKey, apiSecret } = readServerLiveKitCredentials();
  if (!configured || !url) {
    throw new Error('LiveKit server credentials are not configured.');
  }

  const token = new AccessToken(apiKey, apiSecret, {
    identity: params.identity,
    name: params.name,
    ttl: params.ttlSeconds ?? 3600,
  });

  token.addGrant({
    room: params.room,
    roomJoin: true,
    canPublish: params.canPublish,
    canSubscribe: params.canSubscribe ?? true,
    canPublishData: true,
  });

  const jwt = await token.toJwt();
  return { jwt, livekitUrl: url };
}

async function verifyFirebaseBearerToken(
  idToken: string,
  firebaseApiKey?: string
): Promise<VerifiedFirebaseUser | null> {
  if (!firebaseApiKey || !idToken || !JWT_SHAPE_PATTERN.test(idToken)) {
    return null;
  }
  try {
    const endpoint = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(
      firebaseApiKey
    )}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      users?: Array<{ localId?: string; email?: string; displayName?: string }>;
    };
    const user = data.users?.[0];
    if (!user?.localId) return null;
    return {
      uid: user.localId,
      email: user.email,
      displayName: user.displayName,
    };
  } catch {
    return null;
  }
}

export function createFirebaseAuthMiddleware(firebaseApiKey?: string) {
  return async function requireFirebaseAuth(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const authHeader = req.headers.authorization || '';
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!tokenMatch) {
      res.status(401).json({ error: 'Authentication bearer token is required.' });
      return;
    }

    const verifiedUser = await verifyFirebaseBearerToken(tokenMatch[1].trim(), firebaseApiKey);
    if (!verifiedUser) {
      res.status(401).json({ error: 'Invalid or expired Firebase authentication token.' });
      return;
    }

    (res.locals as VerifiedLocals).verifiedUser = verifiedUser;
    next();
  };
}

export function createLiveKitVerifier() {
  let cachedLkVerification: LiveKitVerificationState | null = null;

  return async function verifyLiveKitCredentialsWithServer(): Promise<LiveKitVerificationState> {
    const { configured, url, apiKey, apiSecret } = readServerLiveKitCredentials();
    if (!configured || !url) {
      return {
        checkedAt: Date.now(),
        fingerprint: '',
        configured: false,
        verified: false,
        livekitUrl: null,
        errorCode: 'MISSING_CREDENTIALS',
        error:
          'LiveKit credentials are incomplete. Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET in environment secrets.',
      };
    }

    const fingerprint = crypto
      .createHash('sha256')
      .update(`${url}|${apiKey}|${apiSecret}`)
      .digest('hex')
      .slice(0, 16);

    if (
      cachedLkVerification &&
      cachedLkVerification.fingerprint === fingerprint &&
      Date.now() - cachedLkVerification.checkedAt < 20_000
    ) {
      return cachedLkVerification;
    }

    if (/\s/.test(apiKey) || /\s/.test(apiSecret)) {
      const state: LiveKitVerificationState = {
        checkedAt: Date.now(),
        fingerprint,
        configured: true,
        verified: false,
        livekitUrl: url,
        errorCode: 'MALFORMED_CREDENTIALS',
        error:
          'LIVEKIT_API_KEY or LIVEKIT_API_SECRET contains unexpected spaces. Re-copy them cleanly from LiveKit Cloud -> Settings -> Keys.',
      };
      cachedLkVerification = state;
      return state;
    }

    const looksSwapped = !apiKey.startsWith('API') && apiSecret.startsWith('API');
    if (looksSwapped) {
      const state: LiveKitVerificationState = {
        checkedAt: Date.now(),
        fingerprint,
        configured: true,
        verified: false,
        livekitUrl: url,
        errorCode: 'SWAPPED_CREDENTIALS',
        error:
          'LIVEKIT_API_KEY and LIVEKIT_API_SECRET appear swapped (LiveKit API Keys start with "API"). Swap their values in environment secrets.',
      };
      cachedLkVerification = state;
      return state;
    }

    const { jwt: probeJwt } = await createLiveKitAccessToken({
      identity: 'ainemax-health-probe',
      name: 'ainemax-health-probe',
      room: 'ainemax-health-probe',
      canPublish: false,
      canSubscribe: false,
      ttlSeconds: 60,
    });

    const httpBase = url.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:');
    const validateEndpoint = `${httpBase}/rtc/validate?access_token=${encodeURIComponent(
      probeJwt
    )}&auto_subscribe=1&sdk=js&version=2.25.0`;

    try {
      const resp = await fetch(validateEndpoint, { method: 'GET' });
      const bodyText = (await resp.text()).trim();
      const lowerBody = bodyText.toLowerCase();

      if (resp.ok) {
        const state: LiveKitVerificationState = {
          checkedAt: Date.now(),
          fingerprint,
          configured: true,
          verified: true,
          livekitUrl: url,
          errorCode: null,
          error: null,
        };
        cachedLkVerification = state;
        return state;
      }

      const host = new URL(httpBase).host;
      let errorCode = 'LIVEKIT_AUTH_ERROR';
      let friendly = `LiveKit server (${host}) rejected the configured credentials (${bodyText || `HTTP ${resp.status}`}).`;

      if (lowerBody.includes('invalid api key')) {
        errorCode = 'INVALID_API_KEY';
        friendly = `LiveKit Cloud (${host}) reports "invalid API key". Update LIVEKIT_API_KEY and LIVEKIT_API_SECRET (and verify LIVEKIT_URL) so all three come from the exact same active key pair in LiveKit Cloud -> Settings -> Keys.`;
      } else if (lowerBody.includes('signature') || lowerBody.includes('invalid token')) {
        errorCode = 'INVALID_API_SECRET';
        friendly = `LiveKit Cloud (${host}) rejected the token signature ("${bodyText}"). Verify LIVEKIT_API_SECRET matches the active LIVEKIT_API_KEY in LiveKit Cloud -> Settings -> Keys.`;
      }

      const state: LiveKitVerificationState = {
        checkedAt: Date.now(),
        fingerprint,
        configured: true,
        verified: false,
        livekitUrl: url,
        errorCode,
        error: friendly,
      };
      cachedLkVerification = state;
      return state;
    } catch {
      const state: LiveKitVerificationState = {
        checkedAt: Date.now(),
        fingerprint,
        configured: true,
        verified: false,
        livekitUrl: url,
        errorCode: 'LIVEKIT_UNREACHABLE',
        error: `Unable to reach LiveKit Cloud endpoint (${url}). Verify LIVEKIT_URL is active and reachable.`,
      };
      cachedLkVerification = state;
      return state;
    }
  };
}

export function createLiveKitTokenRouter(deps: LiveKitMiddlewareDeps): Router {
  const router = express.Router();
  const requireFirebaseAuth = createFirebaseAuthMiddleware(deps.firebaseApiKey);
  const verifyLiveKitCredentialsWithServer = createLiveKitVerifier();

  router.get('/status', async (_req: Request, res: Response) => {
    const status = await verifyLiveKitCredentialsWithServer();
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      configured: status.configured,
      verified: status.verified,
      livekitUrl: status.configured ? status.livekitUrl : null,
      errorCode: status.errorCode,
      error: status.error,
    });
  });

  router.post(
    '/token',
    requireFirebaseAuth,
    async (req: Request, res: Response): Promise<void> => {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Pragma', 'no-cache');

      const verifiedUser = (res.locals as VerifiedLocals).verifiedUser;
      if (!verifiedUser) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }

      const body = (req.body || {}) as { roomId?: unknown; role?: unknown };
      const roomId = typeof body.roomId === 'string' ? body.roomId.trim() : '';
      const role = typeof body.role === 'string' ? body.role : 'viewer';

      if (!ROOM_ID_PATTERN.test(roomId)) {
        res.status(400).json({ error: 'Valid roomId is required.' });
        return;
      }

      if (role !== 'host' && role !== 'viewer') {
        res.status(400).json({ error: 'Valid role ("host" or "viewer") is required.' });
        return;
      }

      const { configured, url } = readServerLiveKitCredentials();
      if (!configured || !url) {
        res.status(503).json({
          pendingConfiguration: true,
          errorCode: 'MISSING_CREDENTIALS',
          error:
            'LiveKit video transport credentials (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET) are missing or invalid.',
        });
        return;
      }

      const verification = await verifyLiveKitCredentialsWithServer();
      if (!verification.verified) {
        res.status(503).json({
          pendingConfiguration: true,
          errorCode: verification.errorCode,
          error:
            verification.error ||
            'LiveKit Cloud rejected the configured credentials. Verify LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET.',
        });
        return;
      }

      const streamMeta = await deps.fetchLiveStreamDoc(roomId);
      if (!streamMeta) {
        res.status(404).json({ error: 'Live stream room not found.' });
        return;
      }

      if (streamMeta.status !== 'live') {
        res.status(409).json({ error: 'This live broadcast has already ended.' });
        return;
      }

      const requestedHostRole = role === 'host';
      if (requestedHostRole && streamMeta.hostId !== verifiedUser.uid) {
        res.status(403).json({
          error: 'Only the room host is authorized to publish broadcast streams.',
        });
        return;
      }

      const canPublish = requestedHostRole && streamMeta.hostId === verifiedUser.uid;
      const { jwt } = await createLiveKitAccessToken({
        identity: verifiedUser.uid,
        name: verifiedUser.displayName || verifiedUser.email || verifiedUser.uid,
        room: roomId,
        canPublish,
      });

      res.json({
        token: jwt,
        livekitUrl: url,
        room: roomId,
        canPublish,
      });
    }
  );

  return router;
}
