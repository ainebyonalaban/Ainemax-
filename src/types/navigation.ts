export type NavRouteId =
  | 'home'
  | 'videos'
  | 'movies'
  | 'explore'
  | 'messages'
  | 'notifications'
  | 'stories'
  | 'groups'
  | 'profile'
  | 'settings'
  | 'live'
  | 'admin'
  | 'auth';

export interface NavItemConfig {
  id: NavRouteId;
  label: string;
  path: string;
  description: string;
  section: 'primary' | 'community' | 'account' | 'system';
}

export const PRIMARY_NAV_ITEMS: NavItemConfig[] = [
  {
    id: 'home',
    label: 'Home',
    path: '/',
    description: 'Following and global social feed',
    section: 'primary',
  },
  {
    id: 'videos',
    label: 'Short Videos',
    path: '/videos',
    description: 'Full-screen vertical short video feed',
    section: 'primary',
  },
  {
    id: 'movies',
    label: 'Movies',
    path: '/movies',
    description: 'Long-form films, shows, and creator series',
    section: 'primary',
  },
  {
    id: 'explore',
    label: 'Explore',
    path: '/explore',
    description: 'Search people, posts, videos, and communities',
    section: 'primary',
  },
  {
    id: 'messages',
    label: 'Messages',
    path: '/messages',
    description: 'Private chats and group conversations',
    section: 'primary',
  },
  {
    id: 'notifications',
    label: 'Notifications',
    path: '/notifications',
    description: 'Activity alerts and push updates',
    section: 'primary',
  },
  {
    id: 'stories',
    label: 'Stories',
    path: '/stories',
    description: '24-hour photo and short video moments',
    section: 'community',
  },
  {
    id: 'groups',
    label: 'Groups',
    path: '/groups',
    description: 'Communities, creator pages, and business hubs',
    section: 'community',
  },
  {
    id: 'live',
    label: 'Live',
    path: '/live',
    description: 'Real-time broadcasts and interactive streams',
    section: 'community',
  },
  {
    id: 'profile',
    label: 'Profile',
    path: '/profile',
    description: 'Your public profile, posts, and followers',
    section: 'account',
  },
  {
    id: 'settings',
    label: 'Settings',
    path: '/settings',
    description: 'Account, privacy, and playback preferences',
    section: 'account',
  },
];
