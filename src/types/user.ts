import type { Timestamp } from 'firebase/firestore';

export type AccountType = 'personal' | 'creator' | 'business';
export type AccountStatus = 'active' | 'suspended' | 'banned';
export type ProfileVisibility = 'public' | 'followers' | 'private';

// Synchronized verbatim with firebase-blueprint.json & firestore.rules
export const PROFILE_CONSTRAINTS = {
  UID_MAX: 128,
  UID_REGEX: /^[a-zA-Z0-9_-]+$/,
  USERNAME_MIN: 3,
  USERNAME_MAX: 30,
  USERNAME_REGEX: /^[a-z0-9_]+$/,
  DISPLAY_NAME_MIN: 1,
  DISPLAY_NAME_MAX: 60,
  BIO_MAX: 300,
  URL_MAX: 500,
  EMAIL_MAX: 254,
  PHONE_MAX: 30,
  LANGUAGE_MIN: 2,
  LANGUAGE_MAX: 40,
} as const;

export interface UserPublicProfile {
  uid: string;
  username: string;
  displayName: string;
  bio: string;
  avatarUrl: string;
  coverUrl: string;
  accountType: AccountType;
  isVerified: boolean;
  accountStatus: AccountStatus;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  videosCount: number;
  onboardingComplete: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface UserPrivateInfo {
  uid: string;
  email: string;
  phoneNumber: string;
  language: string;
  profileVisibility: ProfileVisibility;
  fcmToken?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
