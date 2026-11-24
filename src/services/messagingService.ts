import {
  Unsubscribe,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { OperationType, db, handleFirestoreError } from '../lib/firebase';
import { ChatMessage, Conversation } from '../types/features';
import { UserPublicProfile } from '../types/user';
import { createNotification } from './notificationService';

function toMillis(ts: { toMillis?: () => number } | undefined | null): number {
  return ts && typeof ts.toMillis === 'function' ? ts.toMillis() : Date.now();
}

export function buildDirectConversationId(uidA: string, uidB: string): string {
  const sorted = [uidA, uidB].sort();
  return `dm_${sorted[0]}_${sorted[1]}`.slice(0, 128);
}

export async function getOrCreateDirectConversation(
  currentUser: UserPublicProfile,
  otherUser: UserPublicProfile
): Promise<string> {
  const convId = buildDirectConversationId(currentUser.uid, otherUser.uid);
  const convRef = doc(db, 'conversations', convId);
  try {
    const existing = await getDoc(convRef);
    if (!existing.exists()) {
      await setDoc(convRef, {
        id: convId,
        type: 'direct',
        title: `${currentUser.displayName} & ${otherUser.displayName}`.slice(0, 80),
        participantIds: [currentUser.uid, otherUser.uid],
        adminIds: [currentUser.uid, otherUser.uid],
        lastMessageText: '',
        lastMessageSenderId: '',
        typingUserIds: [],
        lastMessageAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return convId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `conversations/${convId}`);
  }
}

export async function createGroupConversation(
  creator: UserPublicProfile,
  title: string,
  participantIds: string[]
): Promise<string> {
  const uniqueIds = Array.from(new Set([creator.uid, ...participantIds])).slice(0, 50);
  const convRef = doc(collection(db, 'conversations'));
  try {
    await setDoc(convRef, {
      id: convRef.id,
      type: 'group',
      title: title.trim().slice(0, 80) || 'Group Chat',
      participantIds: uniqueIds,
      adminIds: [creator.uid],
      lastMessageText: 'Group chat created',
      lastMessageSenderId: creator.uid,
      typingUserIds: [],
      lastMessageAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return convRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `conversations/${convRef.id}`);
  }
}

export function subscribeUserConversations(
  userId: string,
  onChange: (conversations: Conversation[]) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'conversations'), where('participantIds', 'array-contains', userId)),
    (snap) => {
      const items = snap.docs
        .map((d) => d.data() as Conversation)
        .sort((a, b) => toMillis(b.lastMessageAt) - toMillis(a.lastMessageAt));
      onChange(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'conversations');
    }
  );
}

export function subscribeConversationMessages(
  conversationId: string,
  userId: string,
  onChange: (messages: ChatMessage[]) => void
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, 'conversations', conversationId, 'messages'),
      where('participantIds', 'array-contains', userId)
    ),
    (snap) => {
      const list = snap.docs
        .map((d) => d.data() as ChatMessage)
        .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
      onChange(list);
    },
    (error) => {
      handleFirestoreError(
        error,
        OperationType.LIST,
        `conversations/${conversationId}/messages`
      );
    }
  );
}

export async function sendChatMessage(
  conversation: Conversation,
  sender: UserPublicProfile,
  input: { text?: string; imageUrl?: string }
): Promise<void> {
  const text = (input.text ?? '').trim().slice(0, 2000);
  const imageUrl = (input.imageUrl ?? '').trim().slice(0, 500);
  if (!text && !imageUrl) return;

  const msgRef = doc(collection(db, 'conversations', conversation.id, 'messages'));
  const convRef = doc(db, 'conversations', conversation.id);
  const preview = (text || 'Sent an image').slice(0, 300);

  const batch = writeBatch(db);
  batch.set(msgRef, {
    id: msgRef.id,
    conversationId: conversation.id,
    participantIds: conversation.participantIds,
    senderId: sender.uid,
    senderUsername: sender.username,
    senderDisplayName: sender.displayName,
    text,
    imageUrl,
    readBy: [sender.uid],
    createdAt: serverTimestamp(),
  });
  batch.update(convRef, {
    lastMessageText: preview,
    lastMessageSenderId: sender.uid,
    lastMessageAt: serverTimestamp(),
    typingUserIds: arrayRemove(sender.uid),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    conversation.participantIds
      .filter((id) => id !== sender.uid)
      .slice(0, 5)
      .forEach((recipientId) => {
        void createNotification({
          recipientId,
          actor: sender,
          type: 'message',
          title: `New message from ${sender.displayName}`,
          body: preview,
          linkPath: '/messages',
        });
      });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.CREATE,
      `conversations/${conversation.id}/messages/${msgRef.id}`
    );
  }
}

export async function markMessagesRead(
  conversationId: string,
  userId: string,
  unreadMessages: ChatMessage[]
): Promise<void> {
  if (unreadMessages.length === 0) return;
  const batch = writeBatch(db);
  unreadMessages.slice(0, 30).forEach((msg) => {
    batch.update(doc(db, 'conversations', conversationId, 'messages', msg.id), {
      readBy: arrayUnion(userId),
    });
  });
  try {
    await batch.commit();
  } catch (err) {
    console.warn('Mark read skipped:', err);
  }
}

export async function setConversationTyping(
  conversationId: string,
  userId: string,
  isTyping: boolean
): Promise<void> {
  try {
    await updateDoc(doc(db, 'conversations', conversationId), {
      typingUserIds: isTyping ? arrayUnion(userId) : arrayRemove(userId),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Non-critical typing indicator update
  }
}
