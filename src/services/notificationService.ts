import {
  Unsubscribe,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { getToken } from 'firebase/messaging';
import {
  OperationType,
  db,
  getMessagingIfSupported,
  handleFirestoreError,
} from '../lib/firebase';
import { AppNotification, NotificationType } from '../types/features';
import { UserPublicProfile } from '../types/user';

function toMillis(ts: { toMillis?: () => number } | undefined | null): number {
  return ts && typeof ts.toMillis === 'function' ? ts.toMillis() : Date.now();
}

export async function createNotification(input: {
  recipientId: string;
  actor: Pick<UserPublicProfile, 'uid' | 'username' | 'displayName'>;
  type: NotificationType;
  title: string;
  body: string;
  linkPath: string;
}): Promise<void> {
  if (!input.recipientId || input.recipientId === input.actor.uid) {
    return;
  }
  const ref = doc(collection(db, 'notifications'));
  try {
    await setDoc(ref, {
      id: ref.id,
      recipientId: input.recipientId.slice(0, 128),
      actorId: input.actor.uid,
      actorUsername: input.actor.username.slice(0, 30),
      actorDisplayName: input.actor.displayName.slice(0, 60),
      type: input.type,
      title: input.title.trim().slice(0, 120),
      body: input.body.trim().slice(0, 300),
      linkPath: input.linkPath.slice(0, 200),
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    // Non-blocking side effect; log concisely without interrupting user action
    console.warn('Notification dispatch skipped:', err);
  }
}

export function subscribeUserNotifications(
  userId: string,
  onChange: (items: AppNotification[]) => void
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, 'notifications'),
      where('recipientId', '==', userId),
      limit(60)
    ),
    (snap) => {
      const items = snap.docs
        .map((d) => d.data() as AppNotification)
        .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      onChange(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'notifications');
    }
  );
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'notifications', notificationId), { read: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `notifications/${notificationId}`);
  }
}

export async function markAllNotificationsRead(items: AppNotification[]): Promise<void> {
  const unread = items.filter((n) => !n.read);
  if (unread.length === 0) return;
  const batch = writeBatch(db);
  unread.slice(0, 50).forEach((item) => {
    batch.update(doc(db, 'notifications', item.id), { read: true });
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'notifications');
  }
}

export async function deleteNotification(notificationId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'notifications', notificationId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `notifications/${notificationId}`);
  }
}

export async function requestPushNotificationPermission(
  saveToken: (token: string) => Promise<void>
): Promise<{ status: 'granted' | 'denied' | 'unsupported' | 'missing-vapid'; message: string }> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return {
      status: 'unsupported',
      message: 'Browser push notifications are not supported in this browser.',
    };
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return {
      status: 'denied',
      message: 'Notification permission was declined in your browser.',
    };
  }
  const rawVapidKey = (import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined) || '';
  const vapidKey = rawVapidKey.trim().replace(/^["']|["']$/g, '');
  if (!vapidKey) {
    return {
      status: 'missing-vapid',
      message:
        'Browser notification permission granted. Add VITE_FIREBASE_VAPID_KEY from Firebase Console -> Project Settings -> Cloud Messaging to activate background Web Push.',
    };
  }
  const messaging = await getMessagingIfSupported();
  if (!messaging) {
    return {
      status: 'unsupported',
      message: 'Firebase Cloud Messaging is not supported in this browser context.',
    };
  }
  try {
    let serviceWorkerRegistration: ServiceWorkerRegistration | undefined;
    if ('serviceWorker' in navigator) {
      serviceWorkerRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
        scope: '/firebase-cloud-messaging-push-scope',
      });
    }
    const token = await getToken(messaging, {
      vapidKey,
      ...(serviceWorkerRegistration ? { serviceWorkerRegistration } : {}),
    });
    if (token) {
      await saveToken(token);
      return {
        status: 'granted',
        message: 'Push notifications enabled and device token synced.',
      };
    }
    return {
      status: 'missing-vapid',
      message: 'No FCM registration token returned. Verify your VAPID key in Firebase Console.',
    };
  } catch (err) {
    return {
      status: 'unsupported',
      message: err instanceof Error ? err.message : 'Could not register FCM token.',
    };
  }
}
