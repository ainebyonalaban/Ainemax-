import {
  DocumentSnapshot,
  Unsubscribe,
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { OperationType, db, handleFirestoreError } from '../lib/firebase';
import { ShortVideo, VideoComment } from '../types/features';
import { UserPublicProfile } from '../types/user';
import { createNotification } from './notificationService';

function toMillis(ts: { toMillis?: () => number } | undefined | null): number {
  return ts && typeof ts.toMillis === 'function' ? ts.toMillis() : Date.now();
}

function isMissingIndexError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return msg.includes('failed-precondition') || msg.includes('requires an index');
}

export interface VideosPageResult {
  videos: ShortVideo[];
  lastDoc: DocumentSnapshot | null;
  hasMore: boolean;
}

export async function fetchShortVideosPage(
  pageSize = 10,
  cursorDoc: DocumentSnapshot | null = null
): Promise<VideosPageResult> {
  const path = 'videos';
  try {
    const q = cursorDoc
      ? query(
          collection(db, 'videos'),
          where('status', '==', 'active'),
          orderBy('createdAt', 'desc'),
          startAfter(cursorDoc),
          limit(pageSize)
        )
      : query(
          collection(db, 'videos'),
          where('status', '==', 'active'),
          orderBy('createdAt', 'desc'),
          limit(pageSize)
        );
    const snap = await getDocs(q);
    return {
      videos: snap.docs.map((d) => d.data() as ShortVideo),
      lastDoc: snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null,
      hasMore: snap.docs.length === pageSize,
    };
  } catch (error) {
    if (isMissingIndexError(error) && !cursorDoc) {
      const snap = await getDocs(
        query(collection(db, 'videos'), where('status', '==', 'active'), limit(40))
      );
      const sorted = snap.docs
        .map((d) => d.data() as ShortVideo)
        .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      return {
        videos: sorted.slice(0, pageSize),
        lastDoc: null,
        hasMore: false,
      };
    }
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function fetchUserShortVideos(userId: string): Promise<ShortVideo[]> {
  try {
    const snap = await getDocs(
      query(
        collection(db, 'videos'),
        where('authorId', '==', userId),
        where('status', '==', 'active'),
        limit(30)
      )
    );
    return snap.docs
      .map((d) => d.data() as ShortVideo)
      .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'videos');
  }
}

const WATCH_PROGRESS_KEY = 'ainemax_watch_progress_v1';
const viewedVideosThisSession = new Set<string>();

export interface WatchProgressEntry {
  videoId: string;
  currentTimeSec: number;
  durationSec: number;
  updatedAt: number;
}

export function getWatchProgressMap(): Record<string, WatchProgressEntry> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(WATCH_PROGRESS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, WatchProgressEntry>;
  } catch {
    return {};
  }
}

export function saveWatchProgress(
  videoId: string,
  currentTimeSec: number,
  durationSec: number
): void {
  try {
    if (typeof localStorage === 'undefined' || !videoId || durationSec <= 0) return;
    const map = getWatchProgressMap();
    if (currentTimeSec >= durationSec - 3) {
      delete map[videoId];
    } else if (currentTimeSec >= 3) {
      map[videoId] = {
        videoId,
        currentTimeSec: Math.floor(currentTimeSec),
        durationSec: Math.round(durationSec),
        updatedAt: Date.now(),
      };
    }
    localStorage.setItem(WATCH_PROGRESS_KEY, JSON.stringify(map));
  } catch {
    // Ignore localStorage quota errors
  }
}

export function normalizeHashtags(rawInput: string | string[] | undefined): string[] {
  if (!rawInput) return [];
  const rawTokens = Array.isArray(rawInput)
    ? rawInput
    : rawInput.split(/[\s,]+/);
  const cleaned = rawTokens
    .map((t) => t.trim().replace(/^#+/, '').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())
    .filter((t) => t.length >= 1 && t.length <= 36);
  return Array.from(new Set(cleaned)).slice(0, 10);
}

export async function createShortVideo(
  author: UserPublicProfile,
  input: {
    caption: string;
    videoUrl: string;
    thumbnailUrl: string;
    durationSec: number;
    videoFormat?: 'short' | 'long';
    title?: string;
    category?: string;
    hashtags?: string[] | string;
    musicTitle?: string;
    visibility?: 'public' | 'followers';
  }
): Promise<string> {
  const videoFormat: 'short' | 'long' = input.videoFormat === 'long' ? 'long' : 'short';
  const title = (input.title ?? '').trim().slice(0, 120);
  const caption = (
    input.caption.trim() ||
    title ||
    (videoFormat === 'long' ? 'Long video on AINEMAX' : 'Short video on AINEMAX')
  ).slice(0, 500);
  const category = (input.category ?? '').trim().slice(0, 40);
  const hashtags = normalizeHashtags(input.hashtags);
  const musicTitle = (input.musicTitle ?? '').trim().slice(0, 120);
  const visibility: 'public' | 'followers' =
    input.visibility === 'followers' ? 'followers' : 'public';

  const videoRef = doc(collection(db, 'videos'));
  const videoId = videoRef.id;

  const batch = writeBatch(db);
  batch.set(videoRef, {
    id: videoId,
    authorId: author.uid,
    authorUsername: author.username,
    authorDisplayName: author.displayName,
    authorAvatarUrl: author.avatarUrl,
    authorVerified: author.isVerified,
    caption,
    videoUrl: input.videoUrl.slice(0, 500),
    thumbnailUrl: input.thumbnailUrl.slice(0, 500),
    durationSec: Math.max(0, Math.min(7200, Math.round(input.durationSec))),
    likesCount: 0,
    commentsCount: 0,
    sharesCount: 0,
    viewsCount: 0,
    status: 'active',
    videoFormat,
    ...(title ? { title } : {}),
    ...(category ? { category } : {}),
    ...(hashtags.length > 0 ? { hashtags } : {}),
    ...(musicTitle ? { musicTitle } : {}),
    visibility,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'users', author.uid), {
    videosCount: increment(1),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return videoId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `videos/${videoId}`);
  }
}

export async function incrementVideoView(videoId: string): Promise<void> {
  if (!videoId || viewedVideosThisSession.has(videoId)) return;
  viewedVideosThisSession.add(videoId);
  try {
    await updateDoc(doc(db, 'videos', videoId), {
      viewsCount: increment(1),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Unauthenticated viewer or rule mismatch stays non-fatal
  }
}

export async function deleteShortVideo(videoId: string, authorId: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'videos', videoId));
  batch.update(doc(db, 'users', authorId), {
    videosCount: increment(-1),
    updatedAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `videos/${videoId}`);
  }
}

export function subscribeUserVideoLikes(
  userId: string,
  onChange: (likedIds: Set<string>) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'videoLikes'), where('userId', '==', userId)),
    (snap) => {
      const ids = new Set<string>();
      snap.docs.forEach((d) => {
        const data = d.data() as { videoId?: string };
        if (data.videoId) ids.add(data.videoId);
      });
      onChange(ids);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'videoLikes');
    }
  );
}

export function subscribeUserVideoSaves(
  userId: string,
  onChange: (savedIds: Set<string>) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'videoSaves'), where('userId', '==', userId)),
    (snap) => {
      const ids = new Set<string>();
      snap.docs.forEach((d) => {
        const data = d.data() as { videoId?: string };
        if (data.videoId) ids.add(data.videoId);
      });
      onChange(ids);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'videoSaves');
    }
  );
}

export async function toggleSaveVideo(
  videoId: string,
  userId: string,
  currentlySaved: boolean
): Promise<void> {
  const saveId = `${videoId}_${userId}`;
  const saveRef = doc(db, 'videoSaves', saveId);
  try {
    if (currentlySaved) {
      await deleteDoc(saveRef);
    } else {
      const batch = writeBatch(db);
      batch.set(saveRef, {
        id: saveId,
        videoId,
        userId,
        createdAt: serverTimestamp(),
      });
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `videoSaves/${saveId}`);
  }
}

export async function toggleLikeVideo(
  videoId: string,
  userId: string,
  currentlyLiked: boolean,
  actor?: UserPublicProfile | null,
  videoAuthorId?: string
): Promise<void> {
  const likeId = `${videoId}_${userId}`;
  const likeRef = doc(db, 'videoLikes', likeId);
  const videoRef = doc(db, 'videos', videoId);
  const batch = writeBatch(db);

  if (currentlyLiked) {
    batch.delete(likeRef);
    batch.update(videoRef, {
      likesCount: increment(-1),
      updatedAt: serverTimestamp(),
    });
  } else {
    batch.set(likeRef, {
      id: likeId,
      videoId,
      userId,
      createdAt: serverTimestamp(),
    });
    batch.update(videoRef, {
      likesCount: increment(1),
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
    if (!currentlyLiked && actor && videoAuthorId) {
      void createNotification({
        recipientId: videoAuthorId,
        actor,
        type: 'like',
        title: `${actor.displayName} liked your video`,
        body: `@${actor.username} liked your video on AINEMAX.`,
        linkPath: '/videos',
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `videoLikes/${likeId}`);
  }
}

export function subscribeVideoComments(
  videoId: string,
  onChange: (comments: VideoComment[]) => void
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, 'videoComments'),
      where('videoId', '==', videoId),
      where('status', '==', 'active'),
      limit(30)
    ),
    (snap) => {
      const list = snap.docs
        .map((d) => d.data() as VideoComment)
        .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
      onChange(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'videoComments');
    }
  );
}

export async function addVideoComment(
  author: UserPublicProfile,
  videoId: string,
  contentInput: string,
  videoAuthorId?: string
): Promise<void> {
  const content = contentInput.trim().slice(0, 500);
  if (!content) return;
  const commentRef = doc(collection(db, 'videoComments'));
  const batch = writeBatch(db);
  batch.set(commentRef, {
    id: commentRef.id,
    videoId,
    authorId: author.uid,
    authorUsername: author.username,
    authorDisplayName: author.displayName,
    authorVerified: author.isVerified,
    content,
    status: 'active',
    createdAt: serverTimestamp(),
  });
  batch.update(doc(db, 'videos', videoId), {
    commentsCount: increment(1),
    updatedAt: serverTimestamp(),
  });
  try {
    await batch.commit();
    if (videoAuthorId) {
      void createNotification({
        recipientId: videoAuthorId,
        actor: author,
        type: 'comment',
        title: `${author.displayName} commented on your video`,
        body: content,
        linkPath: '/videos',
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `videoComments/${commentRef.id}`);
  }
}

export async function deleteVideoComment(commentId: string, videoId: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'videoComments', commentId));
  batch.update(doc(db, 'videos', videoId), {
    commentsCount: increment(-1),
    updatedAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `videoComments/${commentId}`);
  }
}

export async function incrementVideoShare(videoId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'videos', videoId), {
      sharesCount: increment(1),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `videos/${videoId}`);
  }
}

export async function removeVideoAsAdmin(videoId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'videos', videoId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `videos/${videoId}`);
  }
}
