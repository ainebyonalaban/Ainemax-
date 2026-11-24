import React, { useEffect, useState } from 'react';
import {
  BadgeCheck,
  Ban,
  Check,
  Clock,
  Flag,
  Loader2,
  MessageCircle,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { FollowListModal } from '../components/social/FollowListModal';
import { PostCard } from '../components/social/PostCard';
import { ReportModal } from '../components/social/ReportModal';
import { useAuth } from '../context/AuthContext';
import { getOrCreateDirectConversation } from '../services/messagingService';
import {
  blockUser,
  fetchUserPosts,
  fetchUserProfileByUsername,
  followUser,
  respondFriendRequest,
  sendFriendRequest,
  subscribeIncomingFriendRequests,
  subscribeOutgoingFriendRequests,
  subscribeUserBlocks,
  subscribeUserFollowing,
  subscribeUserLikes,
  unblockUser,
  unfollowUser,
} from '../services/socialService';
import { FriendRequestRecord, Post } from '../types/social';
import { UserPublicProfile } from '../types/user';

export function UserProfilePage() {
  const { username } = useParams<{ username: string }>();
  const { firebaseUser, isVerifiedIdentity, profile: myProfile } = useAuth();
  const navigate = useNavigate();

  const [target, setTarget] = useState<UserPublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<Post[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const [incomingReqs, setIncomingReqs] = useState<FriendRequestRecord[]>([]);
  const [outgoingReqs, setOutgoingReqs] = useState<FriendRequestRecord[]>([]);
  const [followModal, setFollowModal] = useState<'followers' | 'following' | null>(null);
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    if (!username) return;
    let active = true;
    setLoading(true);
    fetchUserProfileByUsername(username)
      .then(async (user) => {
        if (!active) return;
        setTarget(user);
        if (user) {
          const userPosts = await fetchUserPosts(user.uid, user.uid === firebaseUser?.uid);
          if (active) setPosts(userPosts);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [username, firebaseUser?.uid]);

  useEffect(() => {
    if (!firebaseUser || !isVerifiedIdentity) return;
    const unsubLikes = subscribeUserLikes(firebaseUser.uid, setLikedIds);
    const unsubFollows = subscribeUserFollowing(firebaseUser.uid, setFollowingIds);
    const unsubBlocks = subscribeUserBlocks(firebaseUser.uid, setBlockedIds);
    const unsubIn = subscribeIncomingFriendRequests(firebaseUser.uid, setIncomingReqs);
    const unsubOut = subscribeOutgoingFriendRequests(firebaseUser.uid, setOutgoingReqs);
    return () => {
      unsubLikes();
      unsubFollows();
      unsubBlocks();
      unsubIn();
      unsubOut();
    };
  }, [firebaseUser, isVerifiedIdentity]);

  if (myProfile && username?.toLowerCase() === myProfile.username.toLowerCase()) {
    return <Navigate to="/profile" replace />;
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin text-blue-600" aria-hidden="true" />
        <span>Loading profile...</span>
      </div>
    );
  }

  if (!target) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center space-y-3">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">User not found</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          No active AINEMAX profile exists for <span className="font-mono">@{username}</span>.
          {!firebaseUser && ' Sign in to view community profiles.'}
        </p>
        <button
          type="button"
          onClick={() => navigate(firebaseUser ? '/explore?tab=people' : '/auth')}
          className="px-4 py-2.5 min-h-[44px] rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          {firebaseUser ? 'Browse directory' : 'Sign in'}
        </button>
      </div>
    );
  }

  const isFollowing = followingIds.has(target.uid);
  const isBlocked = blockedIds.has(target.uid);
  const incomingFromTarget = incomingReqs.find((r) => r.fromId === target.uid);
  const outgoingToTarget = outgoingReqs.find((r) => r.toId === target.uid);
  const isFriend =
    incomingFromTarget?.status === 'accepted' || outgoingToTarget?.status === 'accepted';

  const requireSignedInProfile = (): boolean => {
    if (!firebaseUser) {
      navigate('/auth');
      return false;
    }
    if (!myProfile?.onboardingComplete) {
      navigate('/onboarding');
      return false;
    }
    return true;
  };

  const handleToggleFollow = async () => {
    if (!requireSignedInProfile() || !myProfile) return;
    if (isFollowing) {
      await unfollowUser(myProfile.uid, target.uid);
      setTarget((prev) =>
        prev ? { ...prev, followersCount: Math.max(0, prev.followersCount - 1) } : prev
      );
    } else {
      await followUser(myProfile, target);
      setTarget((prev) => (prev ? { ...prev, followersCount: prev.followersCount + 1 } : prev));
    }
  };

  const handleStartMessage = async () => {
    if (!requireSignedInProfile() || !myProfile) return;
    const convId = await getOrCreateDirectConversation(myProfile, target);
    navigate(`/messages?chat=${encodeURIComponent(convId)}`);
  };

  return (
    <div className="space-y-5">
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="h-32 sm:h-44 bg-gradient-to-r from-blue-600 via-blue-500 to-sky-400">
          {target.coverUrl && (
            <img
              src={target.coverUrl}
              alt={`${target.displayName} cover`}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          )}
        </div>

        <div className="px-5 sm:px-6 pb-6">
          <div className="flex flex-wrap items-end justify-between gap-4 -mt-12 mb-4">
            <div className="w-24 h-24 rounded-2xl bg-white dark:bg-slate-900 p-1 border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
              {target.avatarUrl ? (
                <img
                  src={target.avatarUrl}
                  alt={target.displayName}
                  referrerPolicy="no-referrer"
                  className="w-full h-full rounded-xl object-cover"
                />
              ) : (
                <div className="w-full h-full rounded-xl bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-blue-700 dark:text-blue-400 font-display font-bold text-2xl">
                  {target.displayName.slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleToggleFollow()}
                className={`inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
                  isFollowing
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {isFollowing ? (
                  <>
                    <UserCheck className="w-4 h-4" aria-hidden="true" />
                    <span>Following</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" aria-hidden="true" />
                    <span>Follow</span>
                  </>
                )}
              </button>

              {isFriend ? (
                <span className="inline-flex items-center gap-1.5 px-3.5 py-2.5 min-h-[44px] rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-medium">
                  <Check className="w-4 h-4" aria-hidden="true" />
                  <span>Friends</span>
                </span>
              ) : incomingFromTarget?.status === 'pending' ? (
                <button
                  type="button"
                  onClick={() => void respondFriendRequest(incomingFromTarget.id, 'accepted')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 min-h-[44px] rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 text-xs font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50"
                >
                  <Check className="w-4 h-4" aria-hidden="true" />
                  <span>Accept friend request</span>
                </button>
              ) : outgoingToTarget?.status === 'pending' ? (
                <span className="inline-flex items-center gap-1.5 px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium">
                  <Clock className="w-4 h-4" aria-hidden="true" />
                  <span>Request sent</span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (!requireSignedInProfile() || !myProfile) return;
                    void sendFriendRequest(myProfile, target);
                  }}
                  className="px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  Add friend
                </button>
              )}

              <button
                type="button"
                onClick={() => void handleStartMessage()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                <MessageCircle className="w-4 h-4" aria-hidden="true" />
                <span>Message</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!requireSignedInProfile() || !myProfile) return;
                  if (isBlocked) {
                    void unblockUser(myProfile.uid, target.uid);
                  } else {
                    void blockUser(myProfile.uid, target.uid);
                  }
                }}
                aria-label={isBlocked ? 'Unblock user' : 'Block user'}
                className="w-11 h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-center"
                title={isBlocked ? 'Unblock user' : 'Block user'}
              >
                <Ban className={`w-4 h-4 ${isBlocked ? 'text-red-600 dark:text-red-400' : ''}`} aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!requireSignedInProfile()) return;
                  setShowReport(true);
                }}
                aria-label="Report user"
                className="w-11 h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-center"
                title="Report user"
              >
                <Flag className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                {target.displayName}
              </h2>
              {target.isVerified && (
                <BadgeCheck className="w-5 h-5 text-blue-600 shrink-0" aria-label="Verified" />
              )}
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-mono">
              @{target.username}
              <span aria-hidden="true" className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
              <span className="font-sans capitalize">{target.accountType} account</span>
            </p>
            {target.bio && (
              <p className="text-sm text-slate-700 dark:text-slate-300 pt-1 max-w-xl leading-relaxed">{target.bio}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-sm">
            <button
              type="button"
              onClick={() => setFollowModal('followers')}
              className="tabular-nums hover:text-blue-600 dark:hover:text-blue-400"
            >
              <span className="font-bold text-slate-900 dark:text-slate-100">{target.followersCount}</span>{' '}
              <span className="text-slate-500 dark:text-slate-400">Followers</span>
            </button>
            <button
              type="button"
              onClick={() => setFollowModal('following')}
              className="tabular-nums hover:text-blue-600 dark:hover:text-blue-400"
            >
              <span className="font-bold text-slate-900 dark:text-slate-100">{target.followingCount}</span>{' '}
              <span className="text-slate-500 dark:text-slate-400">Following</span>
            </button>
            <div className="tabular-nums">
              <span className="font-bold text-slate-900 dark:text-slate-100">{target.postsCount}</span>{' '}
              <span className="text-slate-500 dark:text-slate-400">Posts</span>
            </div>
            <div className="tabular-nums">
              <span className="font-bold text-slate-900 dark:text-slate-100">{target.videosCount ?? 0}</span>{' '}
              <span className="text-slate-500 dark:text-slate-400">Videos</span>
            </div>
          </div>
        </div>
      </section>

      {isBlocked ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center text-sm text-slate-600 dark:text-slate-300">
          You have blocked @{target.username}. Unblock them to view their posts.
        </div>
      ) : posts.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center text-sm text-slate-500 dark:text-slate-400">
          @{target.username} has not published any public posts yet.
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              isLiked={likedIds.has(post.id)}
              isFollowingAuthor={isFollowing}
              onToggleFollowAuthor={() => void handleToggleFollow()}
            />
          ))}
        </div>
      )}

      {followModal && (
        <FollowListModal
          userId={target.uid}
          direction={followModal}
          onClose={() => setFollowModal(null)}
        />
      )}

      {showReport && (
        <ReportModal
          targetType="user"
          targetId={target.uid}
          targetLabel={`@${target.username}`}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
}
