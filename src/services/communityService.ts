import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { OperationType, db, handleFirestoreError } from '../lib/firebase';
import {
  CreatorOrBusinessPage,
  Group,
  GroupMember,
  GroupPost,
  PagePost,
} from '../types/features';
import { UserPublicProfile } from '../types/user';

function toMillis(ts: { toMillis?: () => number } | undefined | null): number {
  return ts && typeof ts.toMillis === 'function' ? ts.toMillis() : Date.now();
}

// --- Groups ---
export async function fetchActiveGroups(): Promise<Group[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'groups'), where('status', '==', 'active'), limit(50))
    );
    return snap.docs
      .map((d) => d.data() as Group)
      .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'groups');
  }
}

export async function fetchUserGroupMemberships(userId: string): Promise<GroupMember[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'groupMembers'), where('userId', '==', userId), limit(50))
    );
    return snap.docs.map((d) => d.data() as GroupMember);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'groupMembers');
  }
}

export async function fetchGroupMembers(groupId: string): Promise<GroupMember[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'groupMembers'), where('groupId', '==', groupId), limit(100))
    );
    return snap.docs.map((d) => d.data() as GroupMember);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'groupMembers');
  }
}

export async function createGroup(
  owner: UserPublicProfile,
  input: { name: string; description: string; privacy: 'public' | 'private'; coverUrl?: string }
): Promise<string> {
  const name = input.name.trim().slice(0, 80);
  if (name.length < 2) throw new Error('Group name must be at least 2 characters.');

  const groupRef = doc(collection(db, 'groups'));
  const groupId = groupRef.id;
  const memberId = `${groupId}_${owner.uid}`;

  const batch = writeBatch(db);
  batch.set(groupRef, {
    id: groupId,
    name,
    description: input.description.trim().slice(0, 500),
    privacy: input.privacy,
    coverUrl: (input.coverUrl ?? '').slice(0, 500),
    ownerId: owner.uid,
    membersCount: 1,
    postsCount: 0,
    status: 'active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'groupMembers', memberId), {
    id: memberId,
    groupId,
    userId: owner.uid,
    username: owner.username,
    displayName: owner.displayName,
    role: 'owner',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return groupId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `groups/${groupId}`);
  }
}

export async function joinPublicGroup(groupId: string, user: UserPublicProfile): Promise<void> {
  const memberId = `${groupId}_${user.uid}`;
  const memberRef = doc(db, 'groupMembers', memberId);
  const existing = await getDoc(memberRef);
  if (existing.exists()) return;

  const batch = writeBatch(db);
  batch.set(memberRef, {
    id: memberId,
    groupId,
    userId: user.uid,
    username: user.username,
    displayName: user.displayName,
    role: 'member',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'groups', groupId), {
    membersCount: increment(1),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `groupMembers/${memberId}`);
  }
}

export async function addMemberToGroup(
  groupId: string,
  targetUser: UserPublicProfile
): Promise<void> {
  const memberId = `${groupId}_${targetUser.uid}`;
  const memberRef = doc(db, 'groupMembers', memberId);
  const existing = await getDoc(memberRef);
  if (existing.exists()) return;

  const batch = writeBatch(db);
  batch.set(memberRef, {
    id: memberId,
    groupId,
    userId: targetUser.uid,
    username: targetUser.username,
    displayName: targetUser.displayName,
    role: 'member',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'groups', groupId), {
    membersCount: increment(1),
    updatedAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `groupMembers/${memberId}`);
  }
}

export async function leaveOrRemoveGroupMember(groupId: string, targetUserId: string): Promise<void> {
  const memberId = `${groupId}_${targetUserId}`;
  const batch = writeBatch(db);
  batch.delete(doc(db, 'groupMembers', memberId));
  batch.update(doc(db, 'groups', groupId), {
    membersCount: increment(-1),
    updatedAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `groupMembers/${memberId}`);
  }
}

export async function updateGroupMemberRole(
  memberId: string,
  role: 'admin' | 'member'
): Promise<void> {
  try {
    await updateDoc(doc(db, 'groupMembers', memberId), {
      role,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `groupMembers/${memberId}`);
  }
}

export async function fetchGroupPosts(groupId: string): Promise<GroupPost[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'groupPosts'), where('groupId', '==', groupId), limit(50))
    );
    return snap.docs
      .map((d) => d.data() as GroupPost)
      .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'groupPosts');
  }
}

export async function createGroupPost(
  groupId: string,
  author: UserPublicProfile,
  input: { content: string; mediaType?: 'text' | 'image' | 'video'; mediaUrl?: string }
): Promise<string> {
  const content = input.content.trim().slice(0, 2000);
  if (!content) throw new Error('Group post content cannot be empty.');
  const postRef = doc(collection(db, 'groupPosts'));
  const mediaUrl = (input.mediaUrl ?? '').slice(0, 500);
  const mediaType = mediaUrl ? (input.mediaType === 'video' ? 'video' : 'image') : 'text';

  const batch = writeBatch(db);
  batch.set(postRef, {
    id: postRef.id,
    groupId,
    authorId: author.uid,
    authorUsername: author.username,
    authorDisplayName: author.displayName,
    content,
    mediaType,
    mediaUrl,
    createdAt: serverTimestamp(),
  });
  batch.update(doc(db, 'groups', groupId), {
    postsCount: increment(1),
    updatedAt: serverTimestamp(),
  });
  try {
    await batch.commit();
    return postRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `groupPosts/${postRef.id}`);
  }
}

export async function deleteGroupPost(postId: string, groupId: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'groupPosts', postId));
  batch.update(doc(db, 'groups', groupId), {
    postsCount: increment(-1),
    updatedAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `groupPosts/${postId}`);
  }
}

// --- Creator & Business Pages ---
export async function fetchActivePages(): Promise<CreatorOrBusinessPage[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'pages'), where('status', '==', 'active'), limit(50))
    );
    return snap.docs
      .map((d) => d.data() as CreatorOrBusinessPage)
      .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'pages');
  }
}

export async function fetchUserFollowedPageIds(userId: string): Promise<Set<string>> {
  try {
    const snap = await getDocs(
      query(collection(db, 'pageFollowers'), where('userId', '==', userId), limit(100))
    );
    const ids = new Set<string>();
    snap.docs.forEach((d) => {
      const data = d.data() as { pageId?: string };
      if (data.pageId) ids.add(data.pageId);
    });
    return ids;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'pageFollowers');
  }
}

export async function createCreatorOrBusinessPage(
  owner: UserPublicProfile,
  input: {
    name: string;
    handle: string;
    pageType: 'creator' | 'business';
    category: string;
    bio: string;
    avatarUrl?: string;
    coverUrl?: string;
  }
): Promise<string> {
  const name = input.name.trim().slice(0, 80);
  const handle = input.handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30);
  if (name.length < 2) throw new Error('Page name must be at least 2 characters.');
  if (handle.length < 3) throw new Error('Page handle must be 3-30 lowercase alphanumeric characters.');

  const pageRef = doc(collection(db, 'pages'));
  try {
    await setDoc(pageRef, {
      id: pageRef.id,
      ownerId: owner.uid,
      name,
      handle,
      pageType: input.pageType,
      category: input.category.trim().slice(0, 60) || 'General',
      bio: input.bio.trim().slice(0, 400),
      avatarUrl: (input.avatarUrl ?? '').slice(0, 500),
      coverUrl: (input.coverUrl ?? '').slice(0, 500),
      isVerified: false,
      followersCount: 0,
      postsCount: 0,
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return pageRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `pages/${pageRef.id}`);
  }
}

export async function toggleFollowPage(
  pageId: string,
  userId: string,
  currentlyFollowing: boolean
): Promise<void> {
  const followId = `${pageId}_${userId}`;
  const followRef = doc(db, 'pageFollowers', followId);
  const pageRef = doc(db, 'pages', pageId);
  const batch = writeBatch(db);
  if (currentlyFollowing) {
    batch.delete(followRef);
    batch.update(pageRef, {
      followersCount: increment(-1),
      updatedAt: serverTimestamp(),
    });
  } else {
    batch.set(followRef, {
      id: followId,
      pageId,
      userId,
      createdAt: serverTimestamp(),
    });
    batch.update(pageRef, {
      followersCount: increment(1),
      updatedAt: serverTimestamp(),
    });
  }
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `pageFollowers/${followId}`);
  }
}

export async function fetchPagePosts(pageId: string): Promise<PagePost[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'pagePosts'), where('pageId', '==', pageId), limit(40))
    );
    return snap.docs
      .map((d) => d.data() as PagePost)
      .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'pagePosts');
  }
}

export async function createPagePost(
  page: CreatorOrBusinessPage,
  authorId: string,
  input: { content: string; mediaType?: 'text' | 'image' | 'video'; mediaUrl?: string }
): Promise<string> {
  const content = input.content.trim().slice(0, 2000);
  if (!content) throw new Error('Page post content cannot be empty.');
  const postRef = doc(collection(db, 'pagePosts'));
  const mediaUrl = (input.mediaUrl ?? '').slice(0, 500);
  const mediaType = mediaUrl ? (input.mediaType === 'video' ? 'video' : 'image') : 'text';

  const batch = writeBatch(db);
  batch.set(postRef, {
    id: postRef.id,
    pageId: page.id,
    authorId,
    pageName: page.name,
    content,
    mediaType,
    mediaUrl,
    createdAt: serverTimestamp(),
  });
  batch.update(doc(db, 'pages', page.id), {
    postsCount: increment(1),
    updatedAt: serverTimestamp(),
  });
  try {
    await batch.commit();
    return postRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `pagePosts/${postRef.id}`);
  }
}

export async function deletePagePost(postId: string, pageId: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'pagePosts', postId));
  batch.update(doc(db, 'pages', pageId), {
    postsCount: increment(-1),
    updatedAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `pagePosts/${postId}`);
  }
}

export async function deleteGroupAsAdmin(groupId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'groups', groupId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `groups/${groupId}`);
  }
}

export async function deletePageAsAdmin(pageId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'pages', pageId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `pages/${pageId}`);
  }
}
