import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  BarChart3,
  Briefcase,
  Download,
  Globe,
  Image as ImageIcon,
  Loader2,
  Lock,
  Plus,
  Send,
  Shield,
  Trash2,
  UserMinus,
  Users,
  Video,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  addMemberToGroup,
  createCreatorOrBusinessPage,
  createGroup,
  createGroupPost,
  createPagePost,
  deleteGroupPost,
  deletePagePost,
  fetchActiveGroups,
  fetchActivePages,
  fetchGroupMembers,
  fetchGroupPosts,
  fetchPagePosts,
  fetchUserFollowedPageIds,
  fetchUserGroupMemberships,
  joinPublicGroup,
  leaveOrRemoveGroupMember,
  toggleFollowPage,
  updateGroupMemberRole,
} from '../services/communityService';
import { downloadMediaFile, uploadImageAsset, uploadVideoAsset } from '../services/mediaUploadService';
import { fetchActiveUsers } from '../services/socialService';
import {
  CreatorOrBusinessPage,
  Group,
  GroupMember,
  GroupPost,
  PagePost,
} from '../types/features';
import { UserPublicProfile } from '../types/user';

type CommunityTab = 'groups' | 'pages';

export function GroupsPage() {
  const { firebaseUser, isVerifiedIdentity, profile, isAdmin } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState<CommunityTab>('groups');
  const [groups, setGroups] = useState<Group[]>([]);
  const [myMemberships, setMyMemberships] = useState<Map<string, GroupMember>>(new Map());
  const [pages, setPages] = useState<CreatorOrBusinessPage[]>([]);
  const [followedPageIds, setFollowedPageIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Selected Group Detail
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [groupPosts, setGroupPosts] = useState<GroupPost[]>([]);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [allUsers, setAllUsers] = useState<UserPublicProfile[]>([]);
  const [groupPostText, setGroupPostText] = useState('');
  const [groupMediaFile, setGroupMediaFile] = useState<File | null>(null);
  const [postingGroup, setPostingGroup] = useState(false);
  const groupFileRef = useRef<HTMLInputElement>(null);

  // Selected Page Detail
  const [selectedPage, setSelectedPage] = useState<CreatorOrBusinessPage | null>(null);
  const [pagePosts, setPagePosts] = useState<PagePost[]>([]);
  const [pagePostText, setPagePostText] = useState('');
  const [pageMediaFile, setPageMediaFile] = useState<File | null>(null);
  const [postingPage, setPostingPage] = useState(false);
  const pageFileRef = useRef<HTMLInputElement>(null);

  // Create Group Modal
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [groupPrivacy, setGroupPrivacy] = useState<'public' | 'private'>('public');
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Create Page Modal
  const [createPageOpen, setCreatePageOpen] = useState(false);
  const [pageName, setPageName] = useState('');
  const [pageHandle, setPageHandle] = useState('');
  const [pageType, setPageType] = useState<'creator' | 'business'>('creator');
  const [pageCategory, setPageCategory] = useState('');
  const [pageBio, setPageBio] = useState('');
  const [creatingPage, setCreatingPage] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadDirectory = useCallback(async () => {
    setLoading(true);
    try {
      const [loadedGroups, loadedPages] = await Promise.all([
        fetchActiveGroups(),
        fetchActivePages(),
      ]);
      setGroups(loadedGroups);
      setPages(loadedPages);

      if (firebaseUser && isVerifiedIdentity) {
        const [memberships, pageIds] = await Promise.all([
          fetchUserGroupMemberships(firebaseUser.uid),
          fetchUserFollowedPageIds(firebaseUser.uid),
        ]);
        const map = new Map<string, GroupMember>();
        memberships.forEach((m) => map.set(m.groupId, m));
        setMyMemberships(map);
        setFollowedPageIds(pageIds);
      }
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, isVerifiedIdentity]);

  useEffect(() => {
    void loadDirectory();
  }, [loadDirectory]);

  const openGroup = async (group: Group) => {
    setSelectedGroup(group);
    setSelectedPage(null);
    setErrorMsg(null);
    const [posts, members, users] = await Promise.all([
      fetchGroupPosts(group.id),
      firebaseUser ? fetchGroupMembers(group.id) : Promise.resolve([]),
      firebaseUser ? fetchActiveUsers(40) : Promise.resolve([]),
    ]);
    setGroupPosts(posts);
    setGroupMembers(members);
    setAllUsers(users);
  };

  const openPage = async (page: CreatorOrBusinessPage) => {
    setSelectedPage(page);
    setSelectedGroup(null);
    setErrorMsg(null);
    const posts = await fetchPagePosts(page.id);
    setPagePosts(posts);
  };

  const requireAuth = () => {
    if (!firebaseUser) {
      navigate('/auth');
      return false;
    }
    if (!profile?.onboardingComplete) {
      navigate('/onboarding');
      return false;
    }
    return true;
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireAuth() || !profile) return;
    setCreatingGroup(true);
    setErrorMsg(null);
    try {
      await createGroup(profile, {
        name: groupName,
        description: groupDesc,
        privacy: groupPrivacy,
      });
      setGroupName('');
      setGroupDesc('');
      setCreateGroupOpen(false);
      await loadDirectory();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to create group.');
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleCreatePage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireAuth() || !profile) return;
    setCreatingPage(true);
    setErrorMsg(null);
    try {
      await createCreatorOrBusinessPage(profile, {
        name: pageName,
        handle: pageHandle,
        pageType,
        category: pageCategory || 'Digital Creator',
        bio: pageBio,
      });
      setPageName('');
      setPageHandle('');
      setPageCategory('');
      setPageBio('');
      setCreatePageOpen(false);
      await loadDirectory();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to create page.');
    } finally {
      setCreatingPage(false);
    }
  };

  const handlePublishGroupPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireAuth() || !profile || !selectedGroup) return;
    if (!groupPostText.trim() && !groupMediaFile) return;
    setPostingGroup(true);
    setErrorMsg(null);
    try {
      let mediaUrl = '';
      let mediaType: 'text' | 'image' | 'video' = 'text';
      if (groupMediaFile) {
        if (groupMediaFile.type.startsWith('video/')) {
          mediaType = 'video';
          const res = await uploadVideoAsset(groupMediaFile, 'gp', profile.uid);
          mediaUrl = res.videoUrl;
        } else {
          mediaType = 'image';
          mediaUrl = await uploadImageAsset(groupMediaFile, 'gp', profile.uid);
        }
      }
      await createGroupPost(selectedGroup.id, profile, {
        content: groupPostText.trim() || 'Shared media in group',
        mediaType,
        mediaUrl,
      });
      setGroupPostText('');
      setGroupMediaFile(null);
      const updatedPosts = await fetchGroupPosts(selectedGroup.id);
      setGroupPosts(updatedPosts);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to post in group.');
    } finally {
      setPostingGroup(false);
    }
  };

  const handlePublishPagePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireAuth() || !profile || !selectedPage) return;
    if (!pagePostText.trim() && !pageMediaFile) return;
    setPostingPage(true);
    setErrorMsg(null);
    try {
      let mediaUrl = '';
      let mediaType: 'text' | 'image' | 'video' = 'text';
      if (pageMediaFile) {
        if (pageMediaFile.type.startsWith('video/')) {
          mediaType = 'video';
          const res = await uploadVideoAsset(pageMediaFile, 'pg', profile.uid);
          mediaUrl = res.videoUrl;
        } else {
          mediaType = 'image';
          mediaUrl = await uploadImageAsset(pageMediaFile, 'pg', profile.uid);
        }
      }
      await createPagePost(selectedPage, profile.uid, {
        content: pagePostText.trim() || 'Shared page update',
        mediaType,
        mediaUrl,
      });
      setPagePostText('');
      setPageMediaFile(null);
      const updated = await fetchPagePosts(selectedPage.id);
      setPagePosts(updated);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to publish page post.');
    } finally {
      setPostingPage(false);
    }
  };

  // Group Detail View
  if (selectedGroup) {
    const myMembership = myMemberships.get(selectedGroup.id);
    const isMember = Boolean(myMembership);
    const isGroupAdmin =
      myMembership?.role === 'owner' || myMembership?.role === 'admin' || isAdmin;
    const memberUserIds = new Set(groupMembers.map((m) => m.userId));
    const nonMembers = allUsers.filter((u) => !memberUserIds.has(u.uid));

    return (
      <div className="space-y-5">
        <input
          ref={groupFileRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) setGroupMediaFile(f);
          }}
        />

        <button
          type="button"
          onClick={() => setSelectedGroup(null)}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Groups & Pages</span>
        </button>

        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{selectedGroup.name}</h2>
                {selectedGroup.privacy === 'private' ? (
                  <Lock className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-label="Private group" />
                ) : (
                  <Globe className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-label="Public group" />
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 capitalize">
                {selectedGroup.privacy} group · {selectedGroup.membersCount} members ·{' '}
                {selectedGroup.postsCount} posts
              </p>
              {selectedGroup.description && (
                <p className="text-sm text-slate-700 dark:text-slate-300 mt-2.5 max-w-xl">
                  {selectedGroup.description}
                </p>
              )}
            </div>

            <div>
              {!isMember ? (
                selectedGroup.privacy === 'public' ? (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!requireAuth() || !profile) return;
                      await joinPublicGroup(selectedGroup.id, profile);
                      await loadDirectory();
                      await openGroup({
                        ...selectedGroup,
                        membersCount: selectedGroup.membersCount + 1,
                      });
                    }}
                    className="px-4 py-2 min-h-[40px] rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
                  >
                    Join Group
                  </button>
                ) : (
                  <span className="text-xs text-slate-500 dark:text-slate-400">Invite-only private group</span>
                )
              ) : myMembership?.role !== 'owner' ? (
                <button
                  type="button"
                  onClick={async () => {
                    if (!profile) return;
                    await leaveOrRemoveGroupMember(selectedGroup.id, profile.uid);
                    await loadDirectory();
                    setSelectedGroup(null);
                  }}
                  className="px-4 py-2 min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Leave Group
                </button>
              ) : null}
            </div>
          </div>
        </section>

        {errorMsg && (
          <p className="text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl px-4 py-2.5">
            {errorMsg}
          </p>
        )}

        {/* Group Post Composer (Members only) */}
        {isMember && (
          <form
            onSubmit={handlePublishGroupPost}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3"
          >
            <textarea
              rows={2}
              maxLength={2000}
              value={groupPostText}
              onChange={(e) => setGroupPostText(e.target.value)}
              placeholder={`Post to ${selectedGroup.name}...`}
              className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-600 focus:outline-none resize-none"
            />
            {groupMediaFile && (
              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-xs text-blue-900 dark:text-blue-200">
                <span className="truncate">{groupMediaFile.name}</span>
                <button type="button" onClick={() => setGroupMediaFile(null)}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => groupFileRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <ImageIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Photo / Video</span>
              </button>
              <button
                type="submit"
                disabled={postingGroup || (!groupPostText.trim() && !groupMediaFile)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {postingGroup ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>Post</span>
              </button>
            </div>
          </form>
        )}

        {/* Group Posts */}
        <section className="space-y-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 px-1">Group Discussion</h3>
          {groupPosts.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center text-sm text-slate-500 dark:text-slate-400">
              No group posts yet.
            </div>
          ) : (
            groupPosts.map((gp) => (
              <article
                key={gp.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{gp.authorDisplayName}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">@{gp.authorUsername}</p>
                  </div>
                  {(gp.authorId === firebaseUser?.uid || isGroupAdmin) && (
                    <button
                      type="button"
                      onClick={async () => {
                        await deleteGroupPost(gp.id, selectedGroup.id);
                        setGroupPosts((prev) => prev.filter((item) => item.id !== gp.id));
                      }}
                      aria-label="Delete group post"
                      className="text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">{gp.content}</p>
                {gp.mediaUrl && gp.mediaType === 'image' && (
                  <div className="relative inline-block">
                    <img
                      src={gp.mediaUrl}
                      alt="Group post media"
                      referrerPolicy="no-referrer"
                      className="rounded-xl max-h-80 object-cover border border-slate-200 dark:border-slate-800"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        void downloadMediaFile(
                          gp.mediaUrl,
                          `ainemax_group_${gp.authorUsername}_${gp.id.slice(0, 6)}`
                        ).catch((err) =>
                          setErrorMsg(err instanceof Error ? err.message : 'Unable to download media.')
                        )
                      }
                      aria-label="Download group photo"
                      title="Download"
                      className="absolute bottom-2.5 right-2.5 w-9 h-9 rounded-full bg-slate-950/70 text-white flex items-center justify-center hover:bg-slate-950 transition-colors"
                    >
                      <Download className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                )}
                {gp.mediaUrl && gp.mediaType === 'video' && (
                  <div className="space-y-2">
                    <video
                      src={gp.mediaUrl}
                      controls
                      playsInline
                      className="rounded-xl max-h-80 w-full bg-slate-950"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() =>
                          void downloadMediaFile(
                            gp.mediaUrl,
                            `ainemax_group_${gp.authorUsername}_${gp.id.slice(0, 6)}`
                          ).catch((err) =>
                            setErrorMsg(err instanceof Error ? err.message : 'Unable to download media.')
                          )
                        }
                        aria-label="Download group video"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <Download className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Download</span>
                      </button>
                    </div>
                  </div>
                )}
              </article>
            ))
          )}
        </section>

        {/* Member Management (Visible to signed-in users, editable by owner/admins) */}
        {firebaseUser && (
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Members ({groupMembers.length})
            </h3>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {groupMembers.map((m) => (
                <li key={m.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {m.displayName}{' '}
                      <span className="text-xs font-normal text-slate-500 dark:text-slate-400 capitalize">
                        · {m.role}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">@{m.username}</p>
                  </div>
                  {isGroupAdmin && m.role !== 'owner' && m.userId !== firebaseUser.uid && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          const nextRole = m.role === 'admin' ? 'member' : 'admin';
                          await updateGroupMemberRole(m.id, nextRole);
                          setGroupMembers((prev) =>
                            prev.map((item) =>
                              item.id === m.id ? { ...item, role: nextRole } : item
                            )
                          );
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <Shield className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        <span>{m.role === 'admin' ? 'Demote' : 'Make Admin'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await leaveOrRemoveGroupMember(selectedGroup.id, m.userId);
                          setGroupMembers((prev) => prev.filter((item) => item.id !== m.id));
                        }}
                        aria-label="Remove member"
                        className="p-1.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                      >
                        <UserMinus className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>

            {isGroupAdmin && nonMembers.length > 0 && (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Add Member to Group</p>
                <div className="flex flex-wrap gap-2">
                  {nonMembers.slice(0, 6).map((u) => (
                    <button
                      key={u.uid}
                      type="button"
                      onClick={async () => {
                        await addMemberToGroup(selectedGroup.id, u);
                        const members = await fetchGroupMembers(selectedGroup.id);
                        setGroupMembers(members);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/50 hover:text-blue-700 dark:hover:text-blue-300 text-xs font-medium text-slate-700 dark:text-slate-200"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>@{u.username}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    );
  }

  // Page Detail View
  if (selectedPage) {
    const isPageOwner = firebaseUser?.uid === selectedPage.ownerId;
    const isFollowing = followedPageIds.has(selectedPage.id);

    return (
      <div className="space-y-5">
        <input
          ref={pageFileRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) setPageMediaFile(f);
          }}
        />

        <button
          type="button"
          onClick={() => setSelectedPage(null)}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Groups & Pages</span>
        </button>

        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{selectedPage.name}</h2>
                {selectedPage.isVerified && (
                  <BadgeCheck className="w-5 h-5 text-blue-600" aria-label="Verified page" />
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                <span className="font-mono">@{selectedPage.handle}</span> ·{' '}
                <span className="capitalize">{selectedPage.pageType} Page</span> ·{' '}
                {selectedPage.category}
              </p>
              {selectedPage.bio && (
                <p className="text-sm text-slate-700 dark:text-slate-300 mt-2.5 max-w-xl">{selectedPage.bio}</p>
              )}
            </div>

            {!isPageOwner && (
              <button
                type="button"
                onClick={async () => {
                  if (!requireAuth() || !firebaseUser) return;
                  await toggleFollowPage(selectedPage.id, firebaseUser.uid, isFollowing);
                  setFollowedPageIds((prev) => {
                    const next = new Set(prev);
                    if (isFollowing) next.delete(selectedPage.id);
                    else next.add(selectedPage.id);
                    return next;
                  });
                  setSelectedPage((prev) =>
                    prev
                      ? {
                          ...prev,
                          followersCount: Math.max(
                            0,
                            prev.followersCount + (isFollowing ? -1 : 1)
                          ),
                        }
                      : null
                  );
                }}
                className={`px-4 py-2 min-h-[40px] rounded-xl text-sm font-medium ${
                  isFollowing
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {isFollowing ? 'Following Page' : 'Follow Page'}
              </button>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-center sm:text-left">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70">
              <p className="text-xs text-slate-500 dark:text-slate-400">Followers</p>
              <p className="text-lg font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                {selectedPage.followersCount}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70">
              <p className="text-xs text-slate-500 dark:text-slate-400">Published Posts</p>
              <p className="text-lg font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                {selectedPage.postsCount}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70">
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 justify-center sm:justify-start">
                <BarChart3 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Analytics</span>
              </p>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-1">
                {selectedPage.isVerified ? 'Verified Reach' : 'Standard Reach'}
              </p>
            </div>
          </div>
        </section>

        {errorMsg && (
          <p className="text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl px-4 py-2.5">
            {errorMsg}
          </p>
        )}

        {isPageOwner && (
          <form
            onSubmit={handlePublishPagePost}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3"
          >
            <textarea
              rows={2}
              maxLength={2000}
              value={pagePostText}
              onChange={(e) => setPagePostText(e.target.value)}
              placeholder={`Publish an update as ${selectedPage.name}...`}
              className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-600 focus:outline-none resize-none"
            />
            {pageMediaFile && (
              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-xs text-blue-900 dark:text-blue-200">
                <span className="truncate">{pageMediaFile.name}</span>
                <button type="button" onClick={() => setPageMediaFile(null)}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => pageFileRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Video className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Photo / Video</span>
              </button>
              <button
                type="submit"
                disabled={postingPage || (!pagePostText.trim() && !pageMediaFile)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {postingPage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>Publish</span>
              </button>
            </div>
          </form>
        )}

        <section className="space-y-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 px-1">Page Updates</h3>
          {pagePosts.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center text-sm text-slate-500 dark:text-slate-400">
              No updates published on this page yet.
            </div>
          ) : (
            pagePosts.map((pp) => (
              <article
                key={pp.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{pp.pageName}</p>
                  {(pp.authorId === firebaseUser?.uid || isAdmin) && (
                    <button
                      type="button"
                      onClick={async () => {
                        await deletePagePost(pp.id, selectedPage.id);
                        setPagePosts((prev) => prev.filter((item) => item.id !== pp.id));
                      }}
                      aria-label="Delete page post"
                      className="text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">{pp.content}</p>
                {pp.mediaUrl && pp.mediaType === 'image' && (
                  <div className="relative inline-block">
                    <img
                      src={pp.mediaUrl}
                      alt="Page media"
                      referrerPolicy="no-referrer"
                      className="rounded-xl max-h-80 object-cover border border-slate-200 dark:border-slate-800"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        void downloadMediaFile(
                          pp.mediaUrl,
                          `ainemax_page_${pp.id.slice(0, 6)}`
                        ).catch((err) =>
                          setErrorMsg(err instanceof Error ? err.message : 'Unable to download media.')
                        )
                      }
                      aria-label="Download page photo"
                      title="Download"
                      className="absolute bottom-2.5 right-2.5 w-9 h-9 rounded-full bg-slate-950/70 text-white flex items-center justify-center hover:bg-slate-950 transition-colors"
                    >
                      <Download className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                )}
                {pp.mediaUrl && pp.mediaType === 'video' && (
                  <div className="space-y-2">
                    <video
                      src={pp.mediaUrl}
                      controls
                      playsInline
                      className="rounded-xl max-h-80 w-full bg-slate-950"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() =>
                          void downloadMediaFile(
                            pp.mediaUrl,
                            `ainemax_page_${pp.id.slice(0, 6)}`
                          ).catch((err) =>
                            setErrorMsg(err instanceof Error ? err.message : 'Unable to download media.')
                          )
                        }
                        aria-label="Download page video"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <Download className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Download</span>
                      </button>
                    </div>
                  </div>
                )}
              </article>
            ))
          )}
        </section>
      </div>
    );
  }

  // Main Groups & Pages Directory
  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-1.5 flex items-center gap-1">
        <button
          type="button"
          onClick={() => setTab('groups')}
          className={`flex-1 py-2.5 px-4 min-h-[44px] rounded-xl text-sm font-medium transition-colors ${
            tab === 'groups'
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          Groups & Communities
        </button>
        <button
          type="button"
          onClick={() => setTab('pages')}
          className={`flex-1 py-2.5 px-4 min-h-[44px] rounded-xl text-sm font-medium transition-colors ${
            tab === 'pages'
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          Creator & Business Pages
        </button>
      </div>

      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400">
            {tab === 'groups' ? <Users className="w-5 h-5" /> : <Briefcase className="w-5 h-5" />}
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {tab === 'groups' ? 'Groups & Communities' : 'Creator & Business Pages'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {tab === 'groups'
                ? 'Join public communities, share discussions, or launch your own group'
                : 'Follow creators & brands or publish your own page with analytics'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            if (!requireAuth()) return;
            setErrorMsg(null);
            if (tab === 'groups') setCreateGroupOpen(true);
            else setCreatePageOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 min-h-[40px] rounded-xl bg-blue-600 text-white text-xs sm:text-sm font-medium hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          <span>{tab === 'groups' ? 'Create Group' : 'Create Page'}</span>
        </button>
      </section>

      {loading ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          <span>Loading directory...</span>
        </div>
      ) : tab === 'groups' ? (
        groups.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No groups created yet. Launch the first AINEMAX community!
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {groups.map((grp) => {
              const joined = myMemberships.has(grp.id);
              return (
                <article
                  key={grp.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">{grp.name}</h3>
                      {grp.privacy === 'private' ? (
                        <Lock className="w-4 h-4 text-slate-400 shrink-0" />
                      ) : (
                        <Globe className="w-4 h-4 text-blue-600 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 capitalize">
                      {grp.privacy} · {grp.membersCount} members · {grp.postsCount} posts
                    </p>
                    {grp.description && (
                      <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 line-clamp-2">{grp.description}</p>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {joined ? 'Joined' : grp.privacy === 'public' ? 'Open community' : 'Private'}
                    </span>
                    <button
                      type="button"
                      onClick={() => void openGroup(grp)}
                      className="px-3.5 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-xs font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/60"
                    >
                      Open Group
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )
      ) : pages.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center text-sm text-slate-500 dark:text-slate-400">
          No creator or business pages created yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {pages.map((pg) => (
            <article
              key={pg.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between gap-4"
            >
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">{pg.name}</h3>
                  {pg.isVerified && <BadgeCheck className="w-4 h-4 text-blue-600 shrink-0" />}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  <span className="font-mono">@{pg.handle}</span> ·{' '}
                  <span className="capitalize">{pg.pageType}</span> · {pg.category}
                </p>
                {pg.bio && <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 line-clamp-2">{pg.bio}</p>}
              </div>
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {pg.followersCount} followers · {pg.postsCount} posts
                </span>
                <button
                  type="button"
                  onClick={() => void openPage(pg)}
                  className="px-3.5 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-xs font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/60"
                >
                  Open Page
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Create Group Modal */}
      {createGroupOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4"
        >
          <form
            onSubmit={handleCreateGroup}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Create Group</h3>
              <button type="button" onClick={() => setCreateGroupOpen(false)}>
                <X className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              </button>
            </div>
            <input
              type="text"
              required
              minLength={2}
              maxLength={80}
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Group name"
              className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100"
            />
            <select
              value={groupPrivacy}
              onChange={(e) => setGroupPrivacy(e.target.value as 'public' | 'private')}
              className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100"
            >
              <option value="public">Public (Anyone can join)</option>
              <option value="private">Private (Invite / Admin approved)</option>
            </select>
            <textarea
              rows={3}
              maxLength={500}
              value={groupDesc}
              onChange={(e) => setGroupDesc(e.target.value)}
              placeholder="Group description..."
              className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 resize-none"
            />
            {errorMsg && <p className="text-xs text-red-600 dark:text-red-400">{errorMsg}</p>}
            <button
              type="submit"
              disabled={creatingGroup}
              className="w-full h-11 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {creatingGroup ? 'Creating...' : 'Create Group'}
            </button>
          </form>
        </div>
      )}

      {/* Create Page Modal */}
      {createPageOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4"
        >
          <form
            onSubmit={handleCreatePage}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-5 space-y-3.5"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Create Creator / Business Page</h3>
              <button type="button" onClick={() => setCreatePageOpen(false)}>
                <X className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              </button>
            </div>
            <input
              type="text"
              required
              minLength={2}
              maxLength={80}
              value={pageName}
              onChange={(e) => setPageName(e.target.value)}
              placeholder="Page display name"
              className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100"
            />
            <input
              type="text"
              required
              minLength={3}
              maxLength={30}
              value={pageHandle}
              onChange={(e) => setPageHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              placeholder="page_handle"
              className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-slate-100"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={pageType}
                onChange={(e) => setPageType(e.target.value as 'creator' | 'business')}
                className="h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100"
              >
                <option value="creator">Creator Page</option>
                <option value="business">Business Page</option>
              </select>
              <input
                type="text"
                maxLength={60}
                value={pageCategory}
                onChange={(e) => setPageCategory(e.target.value)}
                placeholder="Category (e.g. Tech)"
                className="h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100"
              />
            </div>
            <textarea
              rows={2}
              maxLength={400}
              value={pageBio}
              onChange={(e) => setPageBio(e.target.value)}
              placeholder="Page bio..."
              className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 resize-none"
            />
            {errorMsg && <p className="text-xs text-red-600 dark:text-red-400">{errorMsg}</p>}
            <button
              type="submit"
              disabled={creatingPage}
              className="w-full h-11 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {creatingPage ? 'Creating...' : 'Create Page'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
