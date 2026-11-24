import type { Timestamp } from 'firebase/firestore';

export type PostMediaType = 'text' | 'image' | 'video';
export type PostVisibility = 'public' | 'followers';
export type CommentStatus = 'active' | 'removed';
export type FriendRequestStatus = 'pending' | 'accepted' | 'rejected';
export type ReportTargetType = 'user' | 'post' | 'comment' | 'video' | 'group' | 'page';
export type ReportStatus = 'pending' | 'reviewed' | 'resolved';

// Synchronized verbatim with firebase-blueprint.json & firestore.rules
export const SOCIAL_CONSTRAINTS = {
  CAPTION_MIN: 1,
  CAPTION_MAX: 2000,
  COMMENT_MIN: 1,
  COMMENT_MAX: 1000,
  MEDIA_URLS_MAX: 4,
  REPORT_REASON_MIN: 2,
  REPORT_REASON_MAX: 100,
  REPORT_DETAILS_MAX: 500,
} as const;

export interface Post {
  id: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorAvatarUrl: string;
  authorVerified: boolean;
  caption: string;
  mediaType: PostMediaType;
  mediaUrls: string[];
  sharedPostId: string;
  visibility: PostVisibility;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  edited: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PostComment {
  id: string;
  postId: string;
  parentCommentId: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorAvatarUrl: string;
  authorVerified: boolean;
  content: string;
  status: CommentStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface LikeRecord {
  id: string;
  postId: string;
  userId: string;
  createdAt: Timestamp;
}

export interface FollowRecord {
  id: string;
  followerId: string;
  followingId: string;
  followerUsername: string;
  followerDisplayName: string;
  followingUsername: string;
  followingDisplayName: string;
  status: 'active';
  createdAt: Timestamp;
}

export interface FriendRequestRecord {
  id: string;
  fromId: string;
  toId: string;
  fromUsername: string;
  fromDisplayName: string;
  toUsername: string;
  toDisplayName: string;
  status: FriendRequestStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface BlockRecord {
  id: string;
  blockerId: string;
  blockedId: string;
  createdAt: Timestamp;
}

export interface ReportRecord {
  id: string;
  reporterId: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  details: string;
  status: ReportStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
