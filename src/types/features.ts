import type { Timestamp } from 'firebase/firestore';

export interface ShortVideo {
  id: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorAvatarUrl: string;
  authorVerified: boolean;
  caption: string;
  videoUrl: string;
  thumbnailUrl: string;
  durationSec: number;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  viewsCount?: number;
  status: 'active' | 'removed';
  videoFormat?: 'short' | 'long';
  title?: string;
  category?: string;
  hashtags?: string[];
  musicTitle?: string;
  visibility?: 'public' | 'followers';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface VideoComment {
  id: string;
  videoId: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorVerified: boolean;
  content: string;
  status: 'active' | 'removed';
  createdAt: Timestamp;
}

export interface Story {
  id: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorAvatarUrl: string;
  mediaType: 'image' | 'video' | 'text';
  mediaUrl: string;
  backgroundColor?: string;
  caption: string;
  viewsCount: number;
  expiresAt: Timestamp;
  createdAt: Timestamp;
}

export interface StoryView {
  id: string;
  storyId: string;
  storyAuthorId?: string;
  viewerId: string;
  viewerUsername?: string;
  viewerDisplayName?: string;
  viewerAvatarUrl?: string;
  createdAt: Timestamp;
}

export interface StoryReaction {
  id: string;
  storyId: string;
  userId: string;
  username?: string;
  displayName?: string;
  emoji: string;
  createdAt: Timestamp;
}

export interface StoryReply {
  id: string;
  storyId: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  content: string;
  createdAt: Timestamp;
}

export interface Conversation {
  id: string;
  type: 'direct' | 'group';
  title: string;
  participantIds: string[];
  adminIds: string[];
  lastMessageText: string;
  lastMessageSenderId: string;
  typingUserIds: string[];
  lastMessageAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  participantIds: string[];
  senderId: string;
  senderUsername: string;
  senderDisplayName: string;
  text: string;
  imageUrl: string;
  readBy: string[];
  createdAt: Timestamp;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  privacy: 'public' | 'private';
  coverUrl: string;
  ownerId: string;
  membersCount: number;
  postsCount: number;
  status: 'active' | 'removed';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface GroupMember {
  id: string;
  groupId: string;
  userId: string;
  username: string;
  displayName: string;
  role: 'owner' | 'admin' | 'member';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface GroupPost {
  id: string;
  groupId: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  content: string;
  mediaType: 'text' | 'image' | 'video';
  mediaUrl: string;
  createdAt: Timestamp;
}

export interface CreatorOrBusinessPage {
  id: string;
  ownerId: string;
  name: string;
  handle: string;
  pageType: 'creator' | 'business';
  category: string;
  bio: string;
  avatarUrl: string;
  coverUrl: string;
  isVerified: boolean;
  followersCount: number;
  postsCount: number;
  status: 'active' | 'removed';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PagePost {
  id: string;
  pageId: string;
  authorId: string;
  pageName: string;
  content: string;
  mediaType: 'text' | 'image' | 'video';
  mediaUrl: string;
  createdAt: Timestamp;
}

export type NotificationType =
  | 'like'
  | 'comment'
  | 'reply'
  | 'follow'
  | 'friend_request'
  | 'message'
  | 'group_invite'
  | 'live'
  | 'announcement';

export interface AppNotification {
  id: string;
  recipientId: string;
  actorId: string;
  actorUsername: string;
  actorDisplayName: string;
  type: NotificationType;
  title: string;
  body: string;
  linkPath: string;
  read: boolean;
  createdAt: Timestamp;
}

export interface LiveStream {
  id: string;
  hostId: string;
  hostUsername: string;
  hostDisplayName: string;
  hostAvatarUrl?: string;
  hostVerified?: boolean;
  title: string;
  category: string;
  coverUrl?: string;
  visibility?: 'public' | 'followers';
  status: 'live' | 'ended';
  viewerCount: number;
  likesCount?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface LiveComment {
  id: string;
  streamId: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  content: string;
  kind?: 'chat' | 'gift';
  createdAt: Timestamp;
}

export interface Announcement {
  id: string;
  authorId: string;
  title: string;
  body: string;
  createdAt: Timestamp;
}

export interface Advertisement {
  id: string;
  title: string;
  sponsorName: string;
  description: string;
  targetUrl: string;
  active: boolean;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PlatformSetting {
  id: string;
  allowRegistrations: boolean;
  allowLiveStreaming: boolean;
  maintenanceMode: boolean;
  maxUploadMb: number;
  updatedBy: string;
  updatedAt: Timestamp;
}

export interface AdminLog {
  id: string;
  adminId: string;
  adminEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  createdAt: Timestamp;
}
