import React, { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  Ban,
  Check,
  CornerDownRight,
  Download,
  Edit3,
  Flag,
  Heart,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Send,
  Share2,
  Trash2,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { usePreferences } from '../../context/PreferencesContext';
import { usePreloadedVideoSrc } from '../../hooks/usePreloadedVideoSrc';
import { downloadMediaFile, prefetchMediaUrl } from '../../services/mediaUploadService';
import {
  addPostComment,
  blockUser,
  deletePost,
  deletePostComment,
  incrementPostShareCount,
  subscribePostComments,
  toggleLikePost,
  updatePostCaption,
} from '../../services/socialService';
import { Post, PostComment, SOCIAL_CONSTRAINTS } from '../../types/social';
import { ReportModal } from './ReportModal';

interface PostCardProps {
  post: Post;
  isLiked: boolean;
  isFollowingAuthor: boolean;
  onToggleFollowAuthor?: (authorId: string) => void;
  onPostDeleted?: (postId: string) => void;
  onPostUpdated?: (postId: string, caption: string) => void;
  onQuoteShare?: (post: Post) => void;
}

function formatTimestamp(ts: { toDate?: () => Date } | null | undefined): string {
  if (!ts || typeof ts.toDate !== 'function') return 'Just now';
  const date = ts.toDate();
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function PostCard({
  post,
  isLiked,
  isFollowingAuthor,
  onToggleFollowAuthor,
  onPostDeleted,
  onPostUpdated,
  onQuoteShare,
}: PostCardProps) {
  const { firebaseUser, profile, isAdmin } = useAuth();
  const { preferences } = usePreferences();
  const navigate = useNavigate();

  const isOwnPost = firebaseUser?.uid === post.authorId;
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editCaption, setEditCaption] = useState(post.caption);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [replyTarget, setReplyTarget] = useState<PostComment | null>(null);
  const [postingComment, setPostingComment] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);
  const [reportTarget, setReportTarget] = useState<{
    type: 'post' | 'user' | 'comment';
    id: string;
    label: string;
  } | null>(null);

  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [downloadingMedia, setDownloadingMedia] = useState(false);
  const [downloadPct, setDownloadPct] = useState<number | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [videoPlaying, setVideoPlaying] = useState(false);

  const { src: resolvedFeedVideoSrc } = usePreloadedVideoSrc(
    post.mediaType === 'video' ? post.mediaUrls?.[0] : undefined,
    videoPlaying
  );

  const handleDownloadMedia = async (url: string, suffix = '') => {
    if (downloadingMedia) return;
    setDownloadingMedia(true);
    setDownloadPct(0);
    setDownloadError(null);
    try {
      await downloadMediaFile(
        url,
        `ainemax_${post.authorUsername}_${post.id.slice(0, 6)}${suffix}`,
        {
          onProgress: (info) => setDownloadPct(info.percent),
        }
      );
    } catch (err) {
      setDownloadError(
        err instanceof Error ? err.message : 'Unable to download media right now.'
      );
    } finally {
      setDownloadingMedia(false);
      setDownloadPct(null);
    }
  };

  useEffect(() => {
    if (!commentsOpen) return;
    const unsub = subscribePostComments(post.id, setComments);
    return () => unsub();
  }, [commentsOpen, post.id]);

  const topLevelComments = useMemo(
    () => comments.filter((c) => !c.parentCommentId),
    [comments]
  );

  const repliesByParent = useMemo(() => {
    const map = new Map<string, PostComment[]>();
    comments.forEach((c) => {
      if (c.parentCommentId) {
        const list = map.get(c.parentCommentId) || [];
        list.push(c);
        map.set(c.parentCommentId, list);
      }
    });
    return map;
  }, [comments]);

  const requireAuth = (): boolean => {
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

  const handleLike = async () => {
    if (!requireAuth() || !firebaseUser) return;
    await toggleLikePost(post.id, firebaseUser.uid, isLiked, profile, post.authorId);
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/?post=${encodeURIComponent(post.id)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedShare(true);
      window.setTimeout(() => setCopiedShare(false), 2000);
    } catch {
      // Clipboard API fallback ignored if denied
    }
    if (firebaseUser && profile?.onboardingComplete) {
      void incrementPostShareCount(post.id);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCaption.trim()) return;
    setSavingEdit(true);
    try {
      await updatePostCaption(post.id, editCaption, post.visibility);
      onPostUpdated?.(post.id, editCaption.trim());
      setEditing(false);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setMenuOpen(false);
    try {
      await deletePost(post.id, post.authorId);
      onPostDeleted?.(post.id);
    } finally {
      setDeleting(false);
    }
  };

  const handleBlockAuthor = async () => {
    if (!firebaseUser) return;
    setMenuOpen(false);
    await blockUser(firebaseUser.uid, post.authorId);
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireAuth() || !profile || !commentText.trim()) return;
    setPostingComment(true);
    try {
      await addPostComment(
        profile,
        post.id,
        commentText,
        replyTarget ? replyTarget.id : '',
        replyTarget ? replyTarget.authorId : post.authorId
      );
      setCommentText('');
      setReplyTarget(null);
    } finally {
      setPostingComment(false);
    }
  };

  const goToAuthor = () => {
    navigate(isOwnPost ? '/profile' : `/u/${post.authorUsername}`);
  };

  return (
    <>
      <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
        {/* Card Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={goToAuthor}
              className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-700 dark:text-blue-400 font-display font-bold text-sm shrink-0 overflow-hidden"
            >
              {post.authorAvatarUrl ? (
                <img
                  src={post.authorAvatarUrl}
                  alt={post.authorDisplayName}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                post.authorDisplayName.slice(0, 1).toUpperCase()
              )}
            </button>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={goToAuthor}
                  className="text-sm font-bold text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate"
                >
                  {post.authorDisplayName}
                </button>
                {post.authorVerified && (
                  <BadgeCheck
                    className="w-4 h-4 text-blue-600 shrink-0"
                    aria-label="Verified account"
                  />
                )}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 flex-wrap">
                <span className="font-mono">@{post.authorUsername}</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{formatTimestamp(post.createdAt)}</span>
                {post.visibility === 'followers' && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Followers</span>
                  </>
                )}
                {post.edited && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Edited</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 relative">
            {!isOwnPost && onToggleFollowAuthor && (
              <button
                type="button"
                onClick={() => {
                  if (!requireAuth()) return;
                  onToggleFollowAuthor(post.authorId);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-xl text-xs font-medium transition-colors whitespace-nowrap ${
                  isFollowingAuthor
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                    : 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60'
                }`}
              >
                {isFollowingAuthor ? (
                  <>
                    <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Following</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Follow</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Post options"
              aria-expanded={menuOpen}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-10 z-20 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-md py-1.5 text-sm">
                {isOwnPost && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setEditCaption(post.caption);
                      setEditing(true);
                    }}
                    className="w-full px-3.5 py-2 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
                  >
                    <Edit3 className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                    <span>Edit post</span>
                  </button>
                )}
                {(isOwnPost || isAdmin) && (
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => void handleDelete()}
                    className="w-full px-3.5 py-2 text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                    <span>{deleting ? 'Deleting...' : 'Delete post'}</span>
                  </button>
                )}
                {!isOwnPost && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        if (!requireAuth()) return;
                        setReportTarget({
                          type: 'post',
                          id: post.id,
                          label: `Post by @${post.authorUsername}`,
                        });
                      }}
                      className="w-full px-3.5 py-2 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
                    >
                      <Flag className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                      <span>Report post</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!requireAuth()) return;
                        void handleBlockAuthor();
                      }}
                      className="w-full px-3.5 py-2 text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center gap-2"
                    >
                      <Ban className="w-4 h-4" aria-hidden="true" />
                      <span>Block @{post.authorUsername}</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Post Body / Inline Edit */}
        {editing ? (
          <form onSubmit={handleSaveEdit} className="space-y-2.5">
            <textarea
              rows={3}
              maxLength={SOCIAL_CONSTRAINTS.CAPTION_MAX}
              value={editCaption}
              onChange={(e) => setEditCaption(e.target.value)}
              className="w-full p-3 rounded-xl border border-blue-500 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none resize-none"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingEdit || !editCaption.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {savingEdit && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
                <span>Save</span>
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            <p className="text-[15px] text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap break-words">
              {post.caption}
            </p>
            {post.mediaUrls && post.mediaUrls.length > 0 && post.mediaType === 'image' && (
              <div
                className={`grid gap-2 ${
                  post.mediaUrls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
                }`}
              >
                {post.mediaUrls.map((url, idx) => (
                  <div
                    key={`${post.id}-img-${idx}`}
                    className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 group"
                  >
                    <button
                      type="button"
                      onMouseEnter={() => void prefetchMediaUrl(url)}
                      onFocus={() => void prefetchMediaUrl(url)}
                      onClick={() => setLightboxUrl(url)}
                      className="block w-full text-left"
                    >
                      <img
                        src={url}
                        alt={`Attachment ${idx + 1} by ${post.authorDisplayName}`}
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        className="w-full max-h-96 object-cover hover:opacity-95 transition-opacity"
                      />
                    </button>
                    <button
                      type="button"
                      disabled={downloadingMedia}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDownloadMedia(url, `_${idx + 1}`);
                      }}
                      aria-label="Download photo"
                      title="Download photo"
                      className="absolute bottom-2.5 right-2.5 w-9 h-9 rounded-full bg-slate-950/70 text-white flex items-center justify-center hover:bg-slate-950 transition-colors"
                    >
                      {downloadingMedia ? (
                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Download className="w-4 h-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
            {post.mediaUrls && post.mediaUrls.length > 0 && post.mediaType === 'video' && (
              <div
                onMouseEnter={() => {
                  if (!preferences.dataSaverMode && preferences.preloadMode !== 'off') {
                    void prefetchMediaUrl(post.mediaUrls![0]);
                  }
                }}
                className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-950"
              >
                <video
                  src={resolvedFeedVideoSrc || post.mediaUrls[0]}
                  controls
                  playsInline
                  preload={
                    preferences.dataSaverMode || preferences.preloadMode === 'off'
                      ? 'metadata'
                      : 'auto'
                  }
                  onPlaying={() => setVideoPlaying(true)}
                  onPause={() => setVideoPlaying(false)}
                  onEnded={() => setVideoPlaying(false)}
                  className="w-full max-h-[420px] object-contain"
                />
                <button
                  type="button"
                  disabled={downloadingMedia}
                  onClick={() => void handleDownloadMedia(post.mediaUrls[0])}
                  aria-label="Download video"
                  title="Download video"
                  className="absolute top-2.5 right-2.5 w-9 h-9 rounded-full bg-slate-950/75 text-white flex items-center justify-center hover:bg-slate-950 transition-colors"
                >
                  {downloadingMedia ? (
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Download className="w-4 h-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Action Row */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={() => void handleLike()}
              aria-pressed={isLiked}
              className={`inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl text-xs sm:text-sm font-medium transition-colors ${
                isLiked
                  ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Heart
                className={`w-4 h-4 ${isLiked ? 'fill-blue-600 dark:fill-blue-400 text-blue-600 dark:text-blue-400' : ''}`}
                aria-hidden="true"
              />
              <span className="tabular-nums">{post.likesCount}</span>
            </button>

            <button
              type="button"
              onClick={() => setCommentsOpen((o) => !o)}
              aria-expanded={commentsOpen}
              className={`inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl text-xs sm:text-sm font-medium transition-colors ${
                commentsOpen
                  ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <MessageCircle className="w-4 h-4" aria-hidden="true" />
              <span className="tabular-nums">{post.commentsCount}</span>
            </button>

            <button
              type="button"
              onClick={() => void handleShare()}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              {copiedShare ? (
                <Check className="w-4 h-4 text-emerald-600" aria-hidden="true" />
              ) : (
                <Share2 className="w-4 h-4" aria-hidden="true" />
              )}
              <span className="tabular-nums">
                {copiedShare ? 'Copied' : post.sharesCount}
              </span>
            </button>
            {post.mediaUrls && post.mediaUrls.length > 0 && (
              <button
                type="button"
                disabled={downloadingMedia}
                onClick={() => void handleDownloadMedia(post.mediaUrls[0])}
                aria-label="Download media"
                title="Download"
                className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                {downloadingMedia ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" aria-hidden="true" />
                    {downloadPct !== null && (
                      <span className="text-[11px] font-mono tabular-nums">{downloadPct}%</span>
                    )}
                  </>
                ) : (
                  <Download className="w-4 h-4" aria-hidden="true" />
                )}
              </button>
            )}
          </div>

          {onQuoteShare && (
            <button
              type="button"
              onClick={() => {
                if (!requireAuth()) return;
                onQuoteShare(post);
              }}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 px-2.5 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors whitespace-nowrap"
            >
              Repost
            </button>
          )}
        </div>

        {downloadError && (
          <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
            <span>{downloadError}</span>
            <button
              type="button"
              onClick={() => setDownloadError(null)}
              aria-label="Dismiss download error"
              className="text-red-500 hover:text-red-700"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Comments & Nested Replies */}
        {commentsOpen && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
            {topLevelComments.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-1">
                No comments yet. Start the conversation.
              </p>
            ) : (
              <div className="space-y-3">
                {topLevelComments.map((comment) => {
                  const replies = repliesByParent.get(comment.id) || [];
                  const canDeleteComment =
                    firebaseUser?.uid === comment.authorId || isAdmin;
                  return (
                    <div key={comment.id} className="space-y-2">
                      <div className="bg-slate-50 dark:bg-slate-800/70 rounded-xl p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <button
                              type="button"
                              onClick={() => navigate(`/u/${comment.authorUsername}`)}
                              className="text-xs font-bold text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 truncate"
                            >
                              {comment.authorDisplayName}
                            </button>
                            {comment.authorVerified && (
                              <BadgeCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            )}
                            <span className="text-[11px] text-slate-400 font-mono">
                              @{comment.authorUsername}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              · {formatTimestamp(comment.createdAt)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                if (!requireAuth()) return;
                                setReplyTarget(comment);
                              }}
                              className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              Reply
                            </button>
                            {canDeleteComment && (
                              <button
                                type="button"
                                onClick={() => void deletePostComment(comment.id, post.id)}
                                aria-label="Delete comment"
                                className="text-slate-400 hover:text-red-600"
                              >
                                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 mt-1 break-words">
                          {comment.content}
                        </p>
                      </div>

                      {replies.length > 0 && (
                        <div className="pl-5 space-y-2">
                          {replies.map((reply) => {
                            const canDeleteReply =
                              firebaseUser?.uid === reply.authorId || isAdmin;
                            return (
                              <div
                                key={reply.id}
                                className="bg-slate-50/70 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-xl p-2.5 flex items-start gap-2"
                              >
                                <CornerDownRight
                                  className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5"
                                  aria-hidden="true"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <button
                                        type="button"
                                        onClick={() => navigate(`/u/${reply.authorUsername}`)}
                                        className="text-xs font-bold text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 truncate"
                                      >
                                        {reply.authorDisplayName}
                                      </button>
                                      <span className="text-[11px] text-slate-400">
                                        · {formatTimestamp(reply.createdAt)}
                                      </span>
                                    </div>
                                    {canDeleteReply && (
                                      <button
                                        type="button"
                                        onClick={() => void deletePostComment(reply.id, post.id)}
                                        aria-label="Delete reply"
                                        className="text-slate-400 hover:text-red-600"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                                      </button>
                                    )}
                                  </div>
                                  <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5 break-words">
                                    {reply.content}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <form onSubmit={handleCommentSubmit} className="space-y-2 pt-1">
              {replyTarget && (
                <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-xs text-blue-800 dark:text-blue-300">
                  <span>Replying to @{replyTarget.authorUsername}</span>
                  <button
                    type="button"
                    onClick={() => setReplyTarget(null)}
                    aria-label="Cancel reply"
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-800"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  maxLength={SOCIAL_CONSTRAINTS.COMMENT_MAX}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder={
                    firebaseUser
                      ? replyTarget
                        ? `Write a reply to @${replyTarget.authorUsername}...`
                        : 'Write a comment...'
                      : 'Sign in to comment...'
                  }
                  onFocus={() => {
                    if (!firebaseUser) navigate('/auth');
                  }}
                  className="flex-1 h-10 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-600 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={postingComment || !commentText.trim()}
                  aria-label="Send comment"
                  className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 disabled:opacity-50 transition-colors shrink-0"
                >
                  {postingComment ? (
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Send className="w-4 h-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </article>

      {reportTarget && (
        <ReportModal
          targetType={reportTarget.type}
          targetId={reportTarget.id}
          targetLabel={reportTarget.label}
          onClose={() => setReportTarget(null)}
        />
      )}

      {lightboxUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          onClick={() => setLightboxUrl(null)}
          className="fixed inset-0 z-50 bg-slate-950/85 flex items-center justify-center p-4"
        >
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <button
              type="button"
              disabled={downloadingMedia}
              onClick={(e) => {
                e.stopPropagation();
                void handleDownloadMedia(lightboxUrl);
              }}
              aria-label="Download image"
              title="Download"
              className="w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center hover:bg-white/25"
            >
              {downloadingMedia ? (
                <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="w-5 h-5" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setLightboxUrl(null)}
              aria-label="Close image preview"
              className="w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center hover:bg-white/25"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
          <img
            src={lightboxUrl}
            alt="Full resolution post attachment"
            referrerPolicy="no-referrer"
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-[90vh] rounded-2xl object-contain"
          />
        </div>
      )}
    </>
  );
}
