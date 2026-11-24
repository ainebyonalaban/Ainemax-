import React, { useEffect, useRef, useState } from 'react';
import {
  BadgeCheck,
  Calendar,
  Camera,
  Check,
  Edit3,
  Film,
  Loader2,
  LogOut,
  Save,
  User,
  UserPlus,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { FollowListModal } from '../components/social/FollowListModal';
import { PostCard } from '../components/social/PostCard';
import { useAuth } from '../context/AuthContext';
import { uploadImageAsset } from '../services/mediaUploadService';
import {
  fetchUserPosts,
  respondFriendRequest,
  subscribeIncomingFriendRequests,
  subscribeUserLikes,
} from '../services/socialService';
import { fetchUserShortVideos } from '../services/videoService';
import { ShortVideo } from '../types/features';
import { FriendRequestRecord, Post } from '../types/social';
import { AccountType, PROFILE_CONSTRAINTS } from '../types/user';

type ProfileTab = 'posts' | 'videos' | 'friends' | 'about';

export function ProfilePage() {
  const { profile, privateInfo, updatePublicProfile, logout } = useAuth();
  const navigate = useNavigate();

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<ProfileTab>('posts');
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [accountType, setAccountType] = useState<AccountType>(profile?.accountType ?? 'personal');
  const [saving, setSaving] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState<'avatar' | 'cover' | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [posts, setPosts] = useState<Post[]>([]);
  const [videos, setVideos] = useState<ShortVideo[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [followModal, setFollowModal] = useState<'followers' | 'following' | null>(null);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequestRecord[]>([]);

  useEffect(() => {
    if (!profile) return;
    setLoadingPosts(true);
    Promise.all([
      fetchUserPosts(profile.uid, true),
      fetchUserShortVideos(profile.uid),
    ])
      .then(([loadedPosts, loadedVideos]) => {
        setPosts(loadedPosts);
        setVideos(loadedVideos);
      })
      .finally(() => setLoadingPosts(false));

    const unsubLikes = subscribeUserLikes(profile.uid, setLikedIds);
    const unsubRequests = subscribeIncomingFriendRequests(profile.uid, setIncomingRequests);
    return () => {
      unsubLikes();
      unsubRequests();
    };
  }, [profile]);

  if (!profile) {
    return null;
  }

  const pendingRequests = incomingRequests.filter((r) => r.status === 'pending');

  const startEditing = () => {
    setDisplayName(profile.displayName);
    setBio(profile.bio);
    setAccountType(profile.accountType);
    setSaveError(null);
    setEditing(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      await updatePublicProfile({ displayName, bio, accountType });
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Unable to save profile changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleUploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSaveError(null);
    setUploadingMedia('avatar');
    try {
      const url = await uploadImageAsset(file, 'av', profile.uid);
      await updatePublicProfile({
        displayName: profile.displayName,
        bio: profile.bio,
        accountType: profile.accountType,
        avatarUrl: url,
      });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to upload avatar.');
    } finally {
      setUploadingMedia(null);
    }
  };

  const handleUploadCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSaveError(null);
    setUploadingMedia('cover');
    try {
      const url = await uploadImageAsset(file, 'cv', profile.uid);
      await updatePublicProfile({
        displayName: profile.displayName,
        bio: profile.bio,
        accountType: profile.accountType,
        coverUrl: url,
      });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to upload cover photo.');
    } finally {
      setUploadingMedia(null);
    }
  };

  const initials = profile.displayName.slice(0, 1).toUpperCase() || 'A';

  return (
    <div className="space-y-5">
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleUploadAvatar}
      />
      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleUploadCover}
      />

      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="relative h-32 sm:h-44 bg-gradient-to-r from-blue-600 via-blue-500 to-sky-400">
          {profile.coverUrl && (
            <img
              src={profile.coverUrl}
              alt={`${profile.displayName} cover`}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          )}
          <button
            type="button"
            disabled={uploadingMedia !== null}
            onClick={() => coverInputRef.current?.click()}
            className="absolute top-3 right-3 inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-xl bg-slate-900/65 text-white text-xs font-medium hover:bg-slate-900/80 transition-colors backdrop-blur-xs"
          >
            {uploadingMedia === 'cover' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Camera className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span>{uploadingMedia === 'cover' ? 'Uploading...' : 'Change cover'}</span>
          </button>
        </div>

        <div className="px-5 sm:px-6 pb-6">
          <div className="flex flex-wrap items-end justify-between gap-4 -mt-12 mb-4">
            <div className="relative w-24 h-24 rounded-2xl bg-white dark:bg-slate-900 p-1 border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="w-full h-full rounded-xl overflow-hidden">
                {profile.avatarUrl ? (
                  <img
                    src={profile.avatarUrl}
                    alt={profile.displayName}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-blue-700 dark:text-blue-400 font-display font-bold text-2xl">
                    {initials}
                  </div>
                )}
              </div>
              <button
                type="button"
                disabled={uploadingMedia !== null}
                onClick={() => avatarInputRef.current?.click()}
                aria-label="Upload profile photo"
                className="absolute -bottom-1.5 -right-1.5 w-8 h-8 rounded-full bg-blue-600 text-white border-2 border-white dark:border-slate-900 flex items-center justify-center hover:bg-blue-700 transition-colors shadow-xs"
              >
                {uploadingMedia === 'avatar' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                )}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={startEditing}
                className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors whitespace-nowrap"
              >
                <Edit3 className="w-4 h-4" aria-hidden="true" />
                <span>Edit profile</span>
              </button>
              <button
                type="button"
                onClick={() => void logout()}
                aria-label="Sign out"
                className="inline-flex items-center gap-2 px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>
          </div>

          {saveError && !editing && (
            <p className="mb-3 text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl px-3 py-2">
              {saveError}
            </p>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                {profile.displayName}
              </h2>
              {profile.isVerified && (
                <BadgeCheck
                  className="w-5 h-5 text-blue-600 shrink-0"
                  aria-label="Verified account"
                />
              )}
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-mono">
              @{profile.username}
              <span aria-hidden="true" className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
              <span className="font-sans capitalize">{profile.accountType} account</span>
            </p>
            {profile.bio ? (
              <p className="text-sm text-slate-700 dark:text-slate-300 pt-1 max-w-xl leading-relaxed">
                {profile.bio}
              </p>
            ) : (
              <p className="text-sm text-slate-400 pt-1">No biography added yet.</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-sm">
            <button
              type="button"
              onClick={() => setFollowModal('followers')}
              className="tabular-nums hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              <span className="font-bold text-slate-900 dark:text-slate-100">{profile.followersCount}</span>{' '}
              <span className="text-slate-500 dark:text-slate-400">Followers</span>
            </button>
            <button
              type="button"
              onClick={() => setFollowModal('following')}
              className="tabular-nums hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              <span className="font-bold text-slate-900 dark:text-slate-100">{profile.followingCount}</span>{' '}
              <span className="text-slate-500 dark:text-slate-400">Following</span>
            </button>
            <div className="tabular-nums">
              <span className="font-bold text-slate-900 dark:text-slate-100">{profile.postsCount}</span>{' '}
              <span className="text-slate-500 dark:text-slate-400">Posts</span>
            </div>
            <div className="tabular-nums">
              <span className="font-bold text-slate-900 dark:text-slate-100">{profile.videosCount}</span>{' '}
              <span className="text-slate-500 dark:text-slate-400">Videos</span>
            </div>
            <div className="inline-flex items-center gap-1.5 text-xs text-slate-400 ml-auto">
              <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{profile.isVerified ? 'Verified by Admin' : 'Standard Account'}</span>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 dark:border-slate-800 px-5 sm:px-6 flex items-center gap-6 overflow-x-auto">
          {(['posts', 'videos', 'friends', 'about'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`py-3.5 min-h-[44px] text-sm font-medium capitalize border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-semibold'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              {tab === 'friends' && pendingRequests.length > 0
                ? `Requests (${pendingRequests.length})`
                : tab === 'friends'
                  ? 'Friend Requests'
                  : tab}
            </button>
          ))}
        </div>
      </section>

      {editing && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Edit Profile Details</h3>
            <button
              type="button"
              onClick={() => setEditing(false)}
              aria-label="Cancel profile editing"
              className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label htmlFor="edit-display-name" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Display Name
              </label>
              <input
                id="edit-display-name"
                type="text"
                required
                maxLength={PROFILE_CONSTRAINTS.DISPLAY_NAME_MAX}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="edit-account-type" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Account Type
              </label>
              <select
                id="edit-account-type"
                value={accountType}
                onChange={(e) => setAccountType(e.target.value as AccountType)}
                className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none"
              >
                <option value="personal">Personal Profile</option>
                <option value="creator">Creator Profile</option>
                <option value="business">Business Page Account</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="edit-bio" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Biography
                </label>
                <span className="text-xs text-slate-400 font-mono tabular-nums">
                  {bio.length}/{PROFILE_CONSTRAINTS.BIO_MAX}
                </span>
              </div>
              <textarea
                id="edit-bio"
                rows={3}
                maxLength={PROFILE_CONSTRAINTS.BIO_MAX}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none resize-none"
              />
            </div>

            {saveError && <p className="text-xs text-red-600 dark:text-red-400">{saveError}</p>}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="px-4 py-2 min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 min-h-[40px] rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="w-4 h-4" aria-hidden="true" />
                )}
                <span>Save changes</span>
              </button>
            </div>
          </form>
        </section>
      )}

      {activeTab === 'posts' && (
        <div className="space-y-4">
          {loadingPosts ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" aria-hidden="true" />
              <span>Loading your posts...</span>
            </div>
          ) : posts.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center space-y-3">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">No posts yet</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Publish your first post from the Home feed to see it on your profile.
              </p>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="px-4 py-2 min-h-[40px] rounded-xl bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
              >
                Go to Home feed
              </button>
            </div>
          ) : (
            posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                isLiked={likedIds.has(post.id)}
                isFollowingAuthor={false}
                onPostDeleted={(deletedId) =>
                  setPosts((prev) => prev.filter((item) => item.id !== deletedId))
                }
                onPostUpdated={(updatedId, nextCaption) =>
                  setPosts((prev) =>
                    prev.map((item) =>
                      item.id === updatedId
                        ? { ...item, caption: nextCaption, edited: true }
                        : item
                    )
                  )
                }
              />
            ))
          )}
        </div>
      )}

      {activeTab === 'videos' && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Your Short Videos</h3>
            <button
              type="button"
              onClick={() => navigate('/videos')}
              className="px-3.5 py-2 min-h-[40px] rounded-xl bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
            >
              Upload Short Video
            </button>
          </div>
          {videos.length === 0 ? (
            <div className="py-8 text-center space-y-2">
              <Film className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" aria-hidden="true" />
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">No short videos uploaded</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Share vertical clips in the Videos section to display them here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {videos.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => navigate('/videos')}
                  className="group relative aspect-[9/16] rounded-xl overflow-hidden bg-slate-950 border border-slate-200 dark:border-slate-800 text-left"
                >
                  {v.thumbnailUrl ? (
                    <img
                      src={v.thumbnailUrl}
                      alt={v.caption}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                  ) : (
                    <video
                      src={v.videoUrl}
                      muted
                      preload="metadata"
                      className="w-full h-full object-cover"
                    />
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/85 via-slate-950/30 to-transparent p-2.5 text-white">
                    <p className="text-xs font-medium line-clamp-2">{v.caption}</p>
                    <p className="text-[11px] text-slate-300 mt-0.5 tabular-nums">
                      {v.likesCount} likes · {v.commentsCount} comments
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'friends' && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Incoming Friend Requests</h3>
          </div>
          {pendingRequests.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-4">No pending friend requests.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {pendingRequests.map((req) => (
                <li
                  key={req.id}
                  className="py-3 flex flex-wrap items-center justify-between gap-3"
                >
                  <button
                    type="button"
                    onClick={() => navigate(`/u/${req.fromUsername}`)}
                    className="text-left hover:text-blue-600 dark:hover:text-blue-400"
                  >
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{req.fromDisplayName}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">@{req.fromUsername}</p>
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void respondFriendRequest(req.id, 'accepted')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[38px] rounded-xl bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
                    >
                      <Check className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Accept</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void respondFriendRequest(req.id, 'rejected')}
                      className="px-3.5 py-2 min-h-[38px] rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      Decline
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {activeTab === 'about' && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-3 text-sm">
          <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-bold">
            <User className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <span>Account Overview</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs sm:text-sm">
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-800">
              <p className="text-slate-400 text-xs">Account Status</p>
              <p className="font-semibold text-slate-900 dark:text-slate-100 capitalize mt-0.5">{profile.accountStatus}</p>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-800">
              <p className="text-slate-400 text-xs">Profile Visibility</p>
              <p className="font-semibold text-slate-900 dark:text-slate-100 capitalize mt-0.5">
                {privateInfo?.profileVisibility ?? 'public'}
              </p>
            </div>
          </div>
        </section>
      )}

      {followModal && (
        <FollowListModal
          userId={profile.uid}
          direction={followModal}
          onClose={() => setFollowModal(null)}
        />
      )}
    </div>
  );
}
