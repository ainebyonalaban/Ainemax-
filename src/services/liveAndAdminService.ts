import {
  Unsubscribe,
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { OperationType, db, handleFirestoreError } from '../lib/firebase';
import {
  AdminLog,
  Advertisement,
  Announcement,
  LiveComment,
  LiveStream,
  PlatformSetting,
} from '../types/features';
import { ReportRecord, ReportStatus } from '../types/social';
import { AccountStatus, UserPublicProfile } from '../types/user';

function toMillis(ts: { toMillis?: () => number } | undefined | null): number {
  return ts && typeof ts.toMillis === 'function' ? ts.toMillis() : Date.now();
}

// --- Live Streaming Rooms & Comments ---
export function subscribeLiveStreams(onChange: (streams: LiveStream[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'liveStreams'), where('status', 'in', ['live', 'ended']), limit(40)),
    (snap) => {
      const list = snap.docs
        .map((d) => d.data() as LiveStream)
        .sort((a, b) => {
          if (a.status !== b.status) return a.status === 'live' ? -1 : 1;
          return toMillis(b.createdAt) - toMillis(a.createdAt);
        });
      onChange(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'liveStreams');
    }
  );
}

export async function startLiveStreamRoom(
  host: UserPublicProfile,
  input: {
    title: string;
    category: string;
    coverUrl?: string;
    visibility?: 'public' | 'followers';
  }
): Promise<string> {
  const title = input.title.trim().slice(0, 120);
  if (title.length < 2) throw new Error('Stream title must be at least 2 characters.');
  const ref = doc(collection(db, 'liveStreams'));
  const coverUrl = (input.coverUrl ?? '').trim().slice(0, 500);
  const visibility: 'public' | 'followers' =
    input.visibility === 'followers' ? 'followers' : 'public';
  try {
    await setDoc(ref, {
      id: ref.id,
      hostId: host.uid,
      hostUsername: host.username,
      hostDisplayName: host.displayName,
      hostAvatarUrl: host.avatarUrl,
      hostVerified: host.isVerified,
      title,
      category: input.category.trim().slice(0, 40) || 'General',
      ...(coverUrl ? { coverUrl } : {}),
      visibility,
      status: 'live',
      viewerCount: 1,
      likesCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `liveStreams/${ref.id}`);
  }
}

export async function endLiveStreamRoom(streamId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'liveStreams', streamId), {
      status: 'ended',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `liveStreams/${streamId}`);
  }
}

export async function adjustStreamViewerCount(streamId: string, delta: 1 | -1): Promise<void> {
  try {
    await updateDoc(doc(db, 'liveStreams', streamId), {
      viewerCount: increment(delta),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Stream may have ended concurrently
  }
}

export async function incrementLiveLike(streamId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'liveStreams', streamId), {
      likesCount: increment(1),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Non-fatal if stream ended
  }
}

export function subscribeLiveComments(
  streamId: string,
  onChange: (comments: LiveComment[]) => void
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, 'liveStreams', streamId, 'comments'),
      where('streamId', '==', streamId),
      limit(250)
    ),
    (snap) => {
      const items = snap.docs
        .map((d) => d.data() as LiveComment)
        .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
      onChange(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, `liveStreams/${streamId}/comments`);
    }
  );
}

export async function sendLiveComment(
  streamId: string,
  author: UserPublicProfile,
  contentInput: string,
  kind: 'chat' | 'gift' = 'chat',
  customCommentId?: string
): Promise<string> {
  const content = contentInput.trim().slice(0, 400);
  if (!content) return '';
  const ref = customCommentId
    ? doc(db, 'liveStreams', streamId, 'comments', customCommentId)
    : doc(collection(db, 'liveStreams', streamId, 'comments'));
  try {
    await setDoc(ref, {
      id: ref.id,
      streamId,
      authorId: author.uid,
      authorUsername: author.username,
      authorDisplayName: author.displayName,
      content,
      kind,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `liveStreams/${streamId}/comments/${ref.id}`);
  }
}

// --- Announcements & Ads (Public/Signed-in Read) ---
export async function fetchAnnouncements(): Promise<Announcement[]> {
  try {
    const snap = await getDocs(query(collection(db, 'announcements'), limit(20)));
    return snap.docs
      .map((d) => d.data() as Announcement)
      .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  } catch {
    return [];
  }
}

export async function fetchActiveAds(): Promise<Advertisement[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'ads'), where('active', '==', true), limit(10))
    );
    return snap.docs.map((d) => d.data() as Advertisement);
  } catch {
    return [];
  }
}

// --- Admin Operations ---
export async function recordAdminLog(input: {
  adminId: string;
  adminEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
}): Promise<void> {
  const ref = doc(collection(db, 'adminLogs'));
  try {
    await setDoc(ref, {
      id: ref.id,
      adminId: input.adminId,
      adminEmail: input.adminEmail.slice(0, 254),
      action: input.action.slice(0, 80),
      targetType: input.targetType.slice(0, 40),
      targetId: input.targetId.slice(0, 128),
      summary: input.summary.slice(0, 400),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Admin log write skipped:', err);
  }
}

export interface AdminStats {
  users: number;
  posts: number;
  videos: number;
  groups: number;
  pages: number;
  reports: number;
}

export async function fetchAdminStats(): Promise<AdminStats> {
  const [users, posts, videos, groups, pages, reports] = await Promise.all([
    getCountFromServer(collection(db, 'users')).then((s) => s.data().count).catch(() => 0),
    getCountFromServer(collection(db, 'posts')).then((s) => s.data().count).catch(() => 0),
    getCountFromServer(collection(db, 'videos')).then((s) => s.data().count).catch(() => 0),
    getCountFromServer(collection(db, 'groups')).then((s) => s.data().count).catch(() => 0),
    getCountFromServer(collection(db, 'pages')).then((s) => s.data().count).catch(() => 0),
    getCountFromServer(collection(db, 'reports')).then((s) => s.data().count).catch(() => 0),
  ]);
  return { users, posts, videos, groups, pages, reports };
}

export async function adminFetchAllUsers(): Promise<UserPublicProfile[]> {
  try {
    const snap = await getDocs(query(collection(db, 'users'), limit(100)));
    return snap.docs
      .map((d) => d.data() as UserPublicProfile)
      .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'users');
  }
}

export async function adminSetUserVerification(
  targetUser: UserPublicProfile,
  isVerified: boolean,
  admin: { uid: string; email: string }
): Promise<void> {
  try {
    await updateDoc(doc(db, 'users', targetUser.uid), {
      isVerified,
      updatedAt: serverTimestamp(),
    });
    await recordAdminLog({
      adminId: admin.uid,
      adminEmail: admin.email,
      action: isVerified ? 'verify_user' : 'revoke_verification',
      targetType: 'user',
      targetId: targetUser.uid,
      summary: `${isVerified ? 'Approved' : 'Revoked'} verified badge for @${targetUser.username}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${targetUser.uid}`);
  }
}

export async function adminSetUserStatus(
  targetUser: UserPublicProfile,
  accountStatus: AccountStatus,
  admin: { uid: string; email: string }
): Promise<void> {
  try {
    await updateDoc(doc(db, 'users', targetUser.uid), {
      accountStatus,
      updatedAt: serverTimestamp(),
    });
    await recordAdminLog({
      adminId: admin.uid,
      adminEmail: admin.email,
      action: `set_status_${accountStatus}`,
      targetType: 'user',
      targetId: targetUser.uid,
      summary: `Set @${targetUser.username} account status to ${accountStatus}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${targetUser.uid}`);
  }
}

export async function adminFetchReports(): Promise<ReportRecord[]> {
  try {
    const snap = await getDocs(query(collection(db, 'reports'), limit(100)));
    return snap.docs
      .map((d) => d.data() as ReportRecord)
      .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'reports');
  }
}

export async function adminUpdateReportStatus(
  reportId: string,
  status: ReportStatus,
  admin: { uid: string; email: string }
): Promise<void> {
  try {
    await updateDoc(doc(db, 'reports', reportId), {
      status,
      updatedAt: serverTimestamp(),
    });
    await recordAdminLog({
      adminId: admin.uid,
      adminEmail: admin.email,
      action: `report_${status}`,
      targetType: 'report',
      targetId: reportId,
      summary: `Marked report ${reportId} as ${status}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `reports/${reportId}`);
  }
}

export async function adminVerifyPage(
  pageId: string,
  pageName: string,
  isVerified: boolean,
  admin: { uid: string; email: string }
): Promise<void> {
  try {
    await updateDoc(doc(db, 'pages', pageId), {
      isVerified,
      updatedAt: serverTimestamp(),
    });
    await recordAdminLog({
      adminId: admin.uid,
      adminEmail: admin.email,
      action: isVerified ? 'verify_page' : 'unverify_page',
      targetType: 'page',
      targetId: pageId,
      summary: `${isVerified ? 'Verified' : 'Unverified'} page "${pageName}"`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `pages/${pageId}`);
  }
}

export async function adminCreateAnnouncement(
  admin: { uid: string; email: string },
  title: string,
  body: string
): Promise<void> {
  const ref = doc(collection(db, 'announcements'));
  try {
    await setDoc(ref, {
      id: ref.id,
      authorId: admin.uid,
      title: title.trim().slice(0, 120),
      body: body.trim().slice(0, 1000),
      createdAt: serverTimestamp(),
    });
    await recordAdminLog({
      adminId: admin.uid,
      adminEmail: admin.email,
      action: 'publish_announcement',
      targetType: 'announcement',
      targetId: ref.id,
      summary: `Published announcement "${title.trim().slice(0, 80)}"`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `announcements/${ref.id}`);
  }
}

export async function adminDeleteAnnouncement(
  announcementId: string,
  admin: { uid: string; email: string }
): Promise<void> {
  try {
    await deleteDoc(doc(db, 'announcements', announcementId));
    await recordAdminLog({
      adminId: admin.uid,
      adminEmail: admin.email,
      action: 'delete_announcement',
      targetType: 'announcement',
      targetId: announcementId,
      summary: `Deleted announcement ${announcementId}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `announcements/${announcementId}`);
  }
}

export async function adminFetchAllAds(): Promise<Advertisement[]> {
  try {
    const snap = await getDocs(query(collection(db, 'ads'), limit(50)));
    return snap.docs
      .map((d) => d.data() as Advertisement)
      .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'ads');
  }
}

export async function adminCreateAd(
  admin: { uid: string; email: string },
  input: { title: string; sponsorName: string; description: string; targetUrl: string }
): Promise<void> {
  const ref = doc(collection(db, 'ads'));
  try {
    await setDoc(ref, {
      id: ref.id,
      title: input.title.trim().slice(0, 100),
      sponsorName: input.sponsorName.trim().slice(0, 60),
      description: input.description.trim().slice(0, 300),
      targetUrl: input.targetUrl.trim().slice(0, 500),
      active: true,
      createdBy: admin.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await recordAdminLog({
      adminId: admin.uid,
      adminEmail: admin.email,
      action: 'create_ad',
      targetType: 'ad',
      targetId: ref.id,
      summary: `Created sponsored campaign "${input.title.trim()}"`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `ads/${ref.id}`);
  }
}

export async function adminToggleAdActive(
  adId: string,
  active: boolean,
  admin: { uid: string; email: string }
): Promise<void> {
  try {
    await updateDoc(doc(db, 'ads', adId), {
      active,
      updatedAt: serverTimestamp(),
    });
    await recordAdminLog({
      adminId: admin.uid,
      adminEmail: admin.email,
      action: active ? 'activate_ad' : 'pause_ad',
      targetType: 'ad',
      targetId: adId,
      summary: `${active ? 'Activated' : 'Paused'} ad ${adId}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `ads/${adId}`);
  }
}

export async function adminDeleteAd(
  adId: string,
  admin: { uid: string; email: string }
): Promise<void> {
  try {
    await deleteDoc(doc(db, 'ads', adId));
    await recordAdminLog({
      adminId: admin.uid,
      adminEmail: admin.email,
      action: 'delete_ad',
      targetType: 'ad',
      targetId: adId,
      summary: `Deleted ad ${adId}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `ads/${adId}`);
  }
}

export async function fetchPlatformSettings(): Promise<PlatformSetting | null> {
  try {
    const snap = await getDoc(doc(db, 'platformSettings', 'global'));
    return snap.exists() ? (snap.data() as PlatformSetting) : null;
  } catch {
    return null;
  }
}

export async function adminSavePlatformSettings(
  admin: { uid: string; email: string },
  input: {
    allowRegistrations: boolean;
    allowLiveStreaming: boolean;
    maintenanceMode: boolean;
    maxUploadMb: number;
  }
): Promise<void> {
  try {
    await setDoc(doc(db, 'platformSettings', 'global'), {
      id: 'global',
      allowRegistrations: input.allowRegistrations,
      allowLiveStreaming: input.allowLiveStreaming,
      maintenanceMode: input.maintenanceMode,
      maxUploadMb: Math.max(1, Math.min(500, Math.round(input.maxUploadMb))),
      updatedBy: admin.uid,
      updatedAt: serverTimestamp(),
    });
    await recordAdminLog({
      adminId: admin.uid,
      adminEmail: admin.email,
      action: 'update_platform_settings',
      targetType: 'platformSettings',
      targetId: 'global',
      summary: `Updated platform settings (maxUpload=${input.maxUploadMb}MB, live=${input.allowLiveStreaming}, maintenance=${input.maintenanceMode})`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'platformSettings/global');
  }
}

export async function adminFetchLogs(): Promise<AdminLog[]> {
  try {
    const snap = await getDocs(query(collection(db, 'adminLogs'), limit(100)));
    return snap.docs
      .map((d) => d.data() as AdminLog)
      .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'adminLogs');
  }
}
