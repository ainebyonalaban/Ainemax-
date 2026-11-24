import {
  DocumentSnapshot,
  Unsubscribe,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { OperationType, db, handleFirestoreError } from '../lib/firebase';
import {
  FollowRecord,
  FriendRequestRecord,
  Post,
  PostComment,
  PostMediaType,
  PostVisibility,
  ReportTargetType,
  SOCIAL_CONSTRAINTS,
} from '../types/social';
import { UserPublicProfile } from '../types/user';
import { createNotification } from './notificationService';

function toMillis(ts: { toMillis?: () => number } | undefined | null): number {
  return ts && typeof ts.toMillis === 'function' ? ts.toMillis() : Date.now();
}

function isMissingIndexError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return msg.includes('failed-precondition') || msg.includes('requires an index');
}

export interface PostsPageResult {
  posts: Post[];
  lastDoc: DocumentSnapshot | null;
  hasMore: boolean;
}

export async function fetchPublicPostsPage(
  pageSize = 15,
  cursorDoc: DocumentSnapshot | null = null
): Promise<PostsPageResult> {
  const path = 'posts';
  try {
    const q = cursorDoc
      ? query(
          collection(db, 'posts'),
          where('visibility', '==', 'public'),
          orderBy('createdAt', 'desc'),
          startAfter(cursorDoc),
          limit(pageSize)
        )
      : query(
          collection(db, 'posts'),
          where('visibility', '==', 'public'),
          orderBy('createdAt', 'desc'),
          limit(pageSize)
        );
    const snap = await getDocs(q);
    const posts = snap.docs.map((d) => d.data() as Post);
    return {
      posts,
      lastDoc: snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null,
      hasMore: snap.docs.length === pageSize,
    };
  } catch (error) {
    if (isMissingIndexError(error) && !cursorDoc) {
      try {
        const fallbackSnap = await getDocs(
          query(collection(db, 'posts'), where('visibility', '==', 'public'), limit(50))
        );
        const sorted = fallbackSnap.docs
          .map((d) => d.data() as Post)
          .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
        return {
          posts: sorted.slice(0, pageSize),
          lastDoc: null,
          hasMore: false,
        };
      } catch (fallbackErr) {
        handleFirestoreError(fallbackErr, OperationType.LIST, path);
      }
    }
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function fetchFollowingPosts(followingIds: string[]): Promise<Post[]> {
  if (followingIds.length === 0) return [];
  const path = 'posts';
  try {
    const chunks: string[][] = [];
    for (let i = 0; i < followingIds.length; i += 30) {
      chunks.push(followingIds.slice(i, i + 30));
    }
    const allPosts: Post[] = [];
    for (const chunk of chunks) {
      const snap = await getDocs(
        query(
          collection(db, 'posts'),
          where('visibility', '==', 'public'),
          where('authorId', 'in', chunk),
          limit(30)
        )
      );
      snap.docs.forEach((d) => allPosts.push(d.data() as Post));
    }
    return allPosts.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function fetchUserPosts(targetUserId: string, isOwnProfile: boolean): Promise<Post[]> {
  const path = 'posts';
  try {
    const q = isOwnProfile
      ? query(collection(db, 'posts'), where('authorId', '==', targetUserId), limit(50))
      : query(
          collection(db, 'posts'),
          where('authorId', '==', targetUserId),
          where('visibility', '==', 'public'),
          limit(50)
        );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => d.data() as Post)
      .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function fetchPostById(postId: string): Promise<Post | null> {
  const path = `posts/${postId}`;
  try {
    const snap = await getDoc(doc(db, 'posts', postId));
    return snap.exists() ? (snap.data() as Post) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function createPost(
  author: UserPublicProfile,
  input: {
    caption: string;
    visibility?: PostVisibility;
    sharedPostId?: string;
    mediaType?: PostMediaType;
    mediaUrls?: string[];
  }
): Promise<string> {
  const caption = input.caption.trim().slice(0, SOCIAL_CONSTRAINTS.CAPTION_MAX);
  if (caption.length < SOCIAL_CONSTRAINTS.CAPTION_MIN) {
    throw new Error('Post caption cannot be empty.');
  }

  const mediaUrls = (input.mediaUrls ?? [])
    .filter((u) => typeof u === 'string' && u.length > 0)
    .slice(0, SOCIAL_CONSTRAINTS.MEDIA_URLS_MAX)
    .map((u) => u.slice(0, 500));
  const mediaType: PostMediaType =
    mediaUrls.length > 0 ? (input.mediaType === 'video' ? 'video' : 'image') : 'text';

  const postRef = doc(collection(db, 'posts'));
  const postId = postRef.id;
  const userRef = doc(db, 'users', author.uid);

  const batch = writeBatch(db);
  batch.set(postRef, {
    id: postId,
    authorId: author.uid,
    authorUsername: author.username,
    authorDisplayName: author.displayName,
    authorAvatarUrl: author.avatarUrl,
    authorVerified: author.isVerified,
    caption,
    mediaType,
    mediaUrls,
    sharedPostId: (input.sharedPostId ?? '').slice(0, 128),
    visibility: input.visibility ?? 'public',
    likesCount: 0,
    commentsCount: 0,
    sharesCount: 0,
    edited: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.update(userRef, {
    postsCount: increment(1),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return postId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `posts/${postId}`);
  }
}

export async function updatePostCaption(
  postId: string,
  captionInput: string,
  visibility: PostVisibility = 'public'
): Promise<void> {
  const caption = captionInput.trim().slice(0, SOCIAL_CONSTRAINTS.CAPTION_MAX);
  if (caption.length < SOCIAL_CONSTRAINTS.CAPTION_MIN) {
    throw new Error('Post caption cannot be empty.');
  }
  const path = `posts/${postId}`;
  try {
    await updateDoc(doc(db, 'posts', postId), {
      caption,
      visibility,
      edited: true,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deletePost(postId: string, authorId: string): Promise<void> {
  const path = `posts/${postId}`;
  const batch = writeBatch(db);
  batch.delete(doc(db, 'posts', postId));
  batch.update(doc(db, 'users', authorId), {
    postsCount: increment(-1),
    updatedAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function toggleLikePost(
  postId: string,
  userId: string,
  currentlyLiked: boolean,
  actor?: UserPublicProfile | null,
  postAuthorId?: string
): Promise<void> {
  const likeId = `${postId}_${userId}`;
  const likeRef = doc(db, 'likes', likeId);
  const postRef = doc(db, 'posts', postId);
  const batch = writeBatch(db);

  if (currentlyLiked) {
    batch.delete(likeRef);
    batch.update(postRef, {
      likesCount: increment(-1),
      updatedAt: serverTimestamp(),
    });
  } else {
    batch.set(likeRef, {
      id: likeId,
      postId,
      userId,
      createdAt: serverTimestamp(),
    });
    batch.update(postRef, {
      likesCount: increment(1),
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
    if (!currentlyLiked && actor && postAuthorId) {
      void createNotification({
        recipientId: postAuthorId,
        actor,
        type: 'like',
        title: `${actor.displayName} liked your post`,
        body: `@${actor.username} reacted to your post on AINEMAX.`,
        linkPath: `/?post=${encodeURIComponent(postId)}`,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `likes/${likeId}`);
  }
}

export async function incrementPostShareCount(postId: string): Promise<void> {
  const path = `posts/${postId}`;
  try {
    await updateDoc(doc(db, 'posts', postId), {
      sharesCount: increment(1),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function subscribeUserLikes(
  userId: string,
  onChange: (likedPostIds: Set<string>) => void
): Unsubscribe {
  const path = 'likes';
  return onSnapshot(
    query(collection(db, 'likes'), where('userId', '==', userId)),
    (snap) => {
      const ids = new Set<string>();
      snap.docs.forEach((d) => {
        const data = d.data() as { postId?: string };
        if (data.postId) ids.add(data.postId);
      });
      onChange(ids);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribePostComments(
  postId: string,
  onChange: (comments: PostComment[]) => void
): Unsubscribe {
  const path = 'comments';
  return onSnapshot(
    query(
      collection(db, 'comments'),
      where('postId', '==', postId),
      where('status', '==', 'active')
    ),
    (snap) => {
      const items = snap.docs
        .map((d) => d.data() as PostComment)
        .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
      onChange(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function addPostComment(
  author: UserPublicProfile,
  postId: string,
  contentInput: string,
  parentCommentId = '',
  notifyRecipientId?: string
): Promise<string> {
  const content = contentInput.trim().slice(0, SOCIAL_CONSTRAINTS.COMMENT_MAX);
  if (content.length < SOCIAL_CONSTRAINTS.COMMENT_MIN) {
    throw new Error('Comment cannot be empty.');
  }

  const commentRef = doc(collection(db, 'comments'));
  const commentId = commentRef.id;
  const postRef = doc(db, 'posts', postId);

  const batch = writeBatch(db);
  batch.set(commentRef, {
    id: commentId,
    postId,
    parentCommentId: parentCommentId.slice(0, 128),
    authorId: author.uid,
    authorUsername: author.username,
    authorDisplayName: author.displayName,
    authorAvatarUrl: author.avatarUrl,
    authorVerified: author.isVerified,
    content,
    status: 'active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.update(postRef, {
    commentsCount: increment(1),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    if (notifyRecipientId) {
      void createNotification({
        recipientId: notifyRecipientId,
        actor: author,
        type: parentCommentId ? 'reply' : 'comment',
        title: parentCommentId
          ? `${author.displayName} replied to your comment`
          : `${author.displayName} commented on your post`,
        body: content,
        linkPath: `/?post=${encodeURIComponent(postId)}`,
      });
    }
    return commentId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `comments/${commentId}`);
  }
}

export async function deletePostComment(commentId: string, postId: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'comments', commentId));
  batch.update(doc(db, 'posts', postId), {
    commentsCount: increment(-1),
    updatedAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `comments/${commentId}`);
  }
}

export async function followUser(
  follower: UserPublicProfile,
  target: UserPublicProfile
): Promise<void> {
  if (follower.uid === target.uid) {
    throw new Error('You cannot follow your own account.');
  }
  const followId = `${follower.uid}_${target.uid}`;
  const followRef = doc(db, 'follows', followId);
  const existing = await getDoc(followRef);
  if (existing.exists()) return;

  const batch = writeBatch(db);
  batch.set(followRef, {
    id: followId,
    followerId: follower.uid,
    followingId: target.uid,
    followerUsername: follower.username,
    followerDisplayName: follower.displayName,
    followingUsername: target.username,
    followingDisplayName: target.displayName,
    status: 'active',
    createdAt: serverTimestamp(),
  });
  batch.update(doc(db, 'users', follower.uid), {
    followingCount: increment(1),
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'users', target.uid), {
    followersCount: increment(1),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    void createNotification({
      recipientId: target.uid,
      actor: follower,
      type: 'follow',
      title: `${follower.displayName} started following you`,
      body: `@${follower.username} followed your AINEMAX profile.`,
      linkPath: `/u/${follower.username}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `follows/${followId}`);
  }
}

export async function unfollowUser(followerUid: string, targetUid: string): Promise<void> {
  const followId = `${followerUid}_${targetUid}`;
  const followRef = doc(db, 'follows', followId);
  const existing = await getDoc(followRef);
  if (!existing.exists()) return;

  const batch = writeBatch(db);
  batch.delete(followRef);
  batch.update(doc(db, 'users', followerUid), {
    followingCount: increment(-1),
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'users', targetUid), {
    followersCount: increment(-1),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `follows/${followId}`);
  }
}

export function subscribeUserFollowing(
  userId: string,
  onChange: (followingIds: Set<string>) => void
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, 'follows'),
      where('followerId', '==', userId),
      where('status', '==', 'active')
    ),
    (snap) => {
      const ids = new Set<string>();
      snap.docs.forEach((d) => {
        const data = d.data() as FollowRecord;
        ids.add(data.followingId);
      });
      onChange(ids);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'follows');
    }
  );
}

export async function fetchFollowList(
  userId: string,
  direction: 'followers' | 'following'
): Promise<FollowRecord[]> {
  try {
    const field = direction === 'followers' ? 'followingId' : 'followerId';
    const snap = await getDocs(
      query(
        collection(db, 'follows'),
        where(field, '==', userId),
        where('status', '==', 'active'),
        limit(100)
      )
    );
    return snap.docs.map((d) => d.data() as FollowRecord);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'follows');
  }
}

export async function fetchActiveUsers(limitCount = 12): Promise<UserPublicProfile[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'users'), where('accountStatus', '==', 'active'), limit(limitCount))
    );
    return snap.docs.map((d) => d.data() as UserPublicProfile);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'users');
  }
}

export async function fetchUserProfileById(userId: string): Promise<UserPublicProfile | null> {
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    return snap.exists() ? (snap.data() as UserPublicProfile) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${userId}`);
  }
}

export async function fetchUserProfileByUsername(
  username: string
): Promise<UserPublicProfile | null> {
  try {
    const clean = username.trim().toLowerCase();
    const claimSnap = await getDoc(doc(db, 'usernames', clean));
    if (!claimSnap.exists()) return null;
    const { uid } = claimSnap.data() as { uid: string };
    return await fetchUserProfileById(uid);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `usernames/${username}`);
  }
}

export async function sendFriendRequest(
  from: UserPublicProfile,
  to: UserPublicProfile
): Promise<void> {
  if (from.uid === to.uid) return;
  const reqId = `${from.uid}_${to.uid}`;
  try {
    await setDoc(doc(db, 'friendRequests', reqId), {
      id: reqId,
      fromId: from.uid,
      toId: to.uid,
      fromUsername: from.username,
      fromDisplayName: from.displayName,
      toUsername: to.username,
      toDisplayName: to.displayName,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    void createNotification({
      recipientId: to.uid,
      actor: from,
      type: 'friend_request',
      title: `${from.displayName} sent you a friend request`,
      body: `Accept or review the request from @${from.username}.`,
      linkPath: '/profile',
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `friendRequests/${reqId}`);
  }
}

export async function respondFriendRequest(
  reqId: string,
  decision: 'accepted' | 'rejected'
): Promise<void> {
  try {
    await updateDoc(doc(db, 'friendRequests', reqId), {
      status: decision,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `friendRequests/${reqId}`);
  }
}

export function subscribeIncomingFriendRequests(
  userId: string,
  onChange: (requests: FriendRequestRecord[]) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'friendRequests'), where('toId', '==', userId)),
    (snap) => {
      onChange(snap.docs.map((d) => d.data() as FriendRequestRecord));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'friendRequests');
    }
  );
}

export function subscribeOutgoingFriendRequests(
  userId: string,
  onChange: (requests: FriendRequestRecord[]) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'friendRequests'), where('fromId', '==', userId)),
    (snap) => {
      onChange(snap.docs.map((d) => d.data() as FriendRequestRecord));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'friendRequests');
    }
  );
}

export function subscribeUserBlocks(
  userId: string,
  onChange: (blockedIds: Set<string>) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'blocks'), where('blockerId', '==', userId)),
    (snap) => {
      const ids = new Set<string>();
      snap.docs.forEach((d) => {
        const data = d.data() as { blockedId?: string };
        if (data.blockedId) ids.add(data.blockedId);
      });
      onChange(ids);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'blocks');
    }
  );
}

export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  if (blockerId === blockedId) return;
  const blockId = `${blockerId}_${blockedId}`;
  try {
    await setDoc(doc(db, 'blocks', blockId), {
      id: blockId,
      blockerId,
      blockedId,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `blocks/${blockId}`);
  }
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  const blockId = `${blockerId}_${blockedId}`;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'blocks', blockId));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `blocks/${blockId}`);
  }
}

export async function submitSafetyReport(
  reporterId: string,
  input: { targetType: ReportTargetType; targetId: string; reason: string; details: string }
): Promise<void> {
  const reason = input.reason.trim().slice(0, SOCIAL_CONSTRAINTS.REPORT_REASON_MAX);
  const details = input.details.trim().slice(0, SOCIAL_CONSTRAINTS.REPORT_DETAILS_MAX);
  if (reason.length < SOCIAL_CONSTRAINTS.REPORT_REASON_MIN) {
    throw new Error('Please provide a reason for your report.');
  }

  const ref = doc(collection(db, 'reports'));
  try {
    await setDoc(ref, {
      id: ref.id,
      reporterId,
      targetType: input.targetType,
      targetId: input.targetId,
      reason,
      details,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `reports/${ref.id}`);
  }
}
