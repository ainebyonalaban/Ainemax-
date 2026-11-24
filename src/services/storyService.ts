import {
  Timestamp,
  Unsubscribe,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { OperationType, db, handleFirestoreError } from '../lib/firebase';
import { Story, StoryReaction, StoryReply, StoryView } from '../types/features';
import { UserPublicProfile } from '../types/user';
import { createNotification } from './notificationService';

function toMillis(ts: { toMillis?: () => number } | undefined | null): number {
  return ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0;
}

export async function fetchActiveStories(): Promise<Story[]> {
  try {
    const nowTs = Timestamp.now();
    const snap = await getDocs(
      query(collection(db, 'stories'), where('expiresAt', '>', nowTs), limit(80))
    );
    const nowMs = Date.now();
    return snap.docs
      .map((d) => d.data() as Story)
      .filter((s) => toMillis(s.expiresAt) > nowMs)
      .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'stories');
  }
}

export async function createStory(
  author: UserPublicProfile,
  input: {
    mediaType: 'image' | 'video' | 'text';
    mediaUrl: string;
    backgroundColor?: string;
    caption?: string;
  }
): Promise<string> {
  const ref = doc(collection(db, 'stories'));
  const expiresAt = Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);
  const caption = (input.caption ?? '').trim().slice(0, 200);
  if (input.mediaType === 'text' && !caption) {
    throw new Error('Text stories require a message.');
  }
  try {
    await setDoc(ref, {
      id: ref.id,
      authorId: author.uid,
      authorUsername: author.username,
      authorDisplayName: author.displayName,
      authorAvatarUrl: author.avatarUrl,
      mediaType: input.mediaType,
      mediaUrl: input.mediaType === 'text' ? '' : input.mediaUrl.slice(0, 500),
      ...(input.backgroundColor
        ? { backgroundColor: input.backgroundColor.slice(0, 60) }
        : {}),
      caption,
      viewsCount: 0,
      expiresAt,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `stories/${ref.id}`);
  }
}

export async function markStoryViewed(
  storyId: string,
  viewer: UserPublicProfile,
  storyAuthorId: string
): Promise<boolean> {
  const viewId = `${storyId}_${viewer.uid}`;
  const viewRef = doc(db, 'storyViews', viewId);
  try {
    const existing = await getDoc(viewRef);
    if (existing.exists()) return false;
    const batch = writeBatch(db);
    batch.set(viewRef, {
      id: viewId,
      storyId,
      storyAuthorId,
      viewerId: viewer.uid,
      viewerUsername: viewer.username,
      viewerDisplayName: viewer.displayName,
      viewerAvatarUrl: viewer.avatarUrl,
      createdAt: serverTimestamp(),
    });
    batch.update(doc(db, 'stories', storyId), {
      viewsCount: increment(1),
    });
    await batch.commit();
    return true;
  } catch (error) {
    console.warn('Story view tracking skipped:', error);
    return false;
  }
}

export async function fetchStoryViewers(
  storyId: string,
  storyAuthorId: string
): Promise<StoryView[]> {
  try {
    const snap = await getDocs(
      query(
        collection(db, 'storyViews'),
        where('storyId', '==', storyId),
        where('storyAuthorId', '==', storyAuthorId),
        limit(100)
      )
    );
    return snap.docs
      .map((d) => d.data() as StoryView)
      .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  } catch {
    return [];
  }
}

export function subscribeStoryReactions(
  storyId: string,
  currentUserId: string,
  isAuthor: boolean,
  onChange: (reactions: StoryReaction[]) => void
): Unsubscribe {
  const q = isAuthor
    ? query(collection(db, 'stories', storyId, 'reactions'), limit(100))
    : query(
        collection(db, 'stories', storyId, 'reactions'),
        where('userId', '==', currentUserId),
        limit(5)
      );
  return onSnapshot(
    q,
    (snap) => {
      onChange(snap.docs.map((d) => d.data() as StoryReaction));
    },
    () => onChange([])
  );
}

export async function setStoryReaction(
  storyId: string,
  user: UserPublicProfile,
  emoji: string,
  storyAuthorId?: string
): Promise<void> {
  const cleanEmoji = emoji.trim().slice(0, 16);
  if (!cleanEmoji) return;
  const reactionRef = doc(db, 'stories', storyId, 'reactions', user.uid);
  try {
    await setDoc(reactionRef, {
      id: user.uid,
      storyId,
      userId: user.uid,
      username: user.username,
      displayName: user.displayName,
      emoji: cleanEmoji,
      createdAt: serverTimestamp(),
    });
    if (storyAuthorId && storyAuthorId !== user.uid) {
      void createNotification({
        recipientId: storyAuthorId,
        actor: user,
        type: 'like',
        title: `${user.displayName} reacted ${cleanEmoji} to your story`,
        body: `@${user.username} reacted to your 24h story.`,
        linkPath: '/stories',
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `stories/${storyId}/reactions/${user.uid}`);
  }
}

export function subscribeStoryReplies(
  storyId: string,
  currentUserId: string,
  isAuthor: boolean,
  onChange: (replies: StoryReply[]) => void
): Unsubscribe {
  const q = isAuthor
    ? query(collection(db, 'stories', storyId, 'replies'), limit(100))
    : query(
        collection(db, 'stories', storyId, 'replies'),
        where('authorId', '==', currentUserId),
        limit(50)
      );
  return onSnapshot(
    q,
    (snap) => {
      onChange(
        snap.docs
          .map((d) => d.data() as StoryReply)
          .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt))
      );
    },
    () => onChange([])
  );
}

export async function sendStoryReply(
  storyId: string,
  author: UserPublicProfile,
  contentInput: string,
  storyAuthorId?: string
): Promise<void> {
  const content = contentInput.trim().slice(0, 400);
  if (!content) return;
  const ref = doc(collection(db, 'stories', storyId, 'replies'));
  try {
    await setDoc(ref, {
      id: ref.id,
      storyId,
      authorId: author.uid,
      authorUsername: author.username,
      authorDisplayName: author.displayName,
      content,
      createdAt: serverTimestamp(),
    });
    if (storyAuthorId && storyAuthorId !== author.uid) {
      void createNotification({
        recipientId: storyAuthorId,
        actor: author,
        type: 'reply',
        title: `${author.displayName} replied to your story`,
        body: content,
        linkPath: '/stories',
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `stories/${storyId}/replies/${ref.id}`);
  }
}

export async function deleteStory(storyId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'stories', storyId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `stories/${storyId}`);
  }
}
