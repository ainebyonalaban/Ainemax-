import React, { useRef, useState } from 'react';
import { Globe, Image, Loader2, Send, Users, Video, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  uploadImageAsset,
  uploadVideoAsset,
  validateImageFile,
  validateVideoFile,
} from '../../services/mediaUploadService';
import { createPost } from '../../services/socialService';
import { PostVisibility, SOCIAL_CONSTRAINTS } from '../../types/social';

interface PostComposerProps {
  onPostCreated?: () => void;
  sharedPostId?: string;
}

interface PendingMediaItem {
  id: string;
  file: File;
  previewUrl: string;
  kind: 'image' | 'video';
}

export function PostComposer({ onPostCreated, sharedPostId }: PostComposerProps) {
  const { firebaseUser, profile } = useAuth();
  const navigate = useNavigate();

  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const [caption, setCaption] = useState('');
  const [visibility, setVisibility] = useState<PostVisibility>('public');
  const [pendingMedia, setPendingMedia] = useState<PendingMediaItem[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!firebaseUser || !profile?.onboardingComplete) {
    return (
      <section
        aria-label="Create post"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-700 dark:text-blue-400 font-display font-bold text-sm shrink-0">
            A
          </div>
          <button
            type="button"
            onClick={() => navigate(firebaseUser ? '/onboarding' : '/auth')}
            className="flex-1 text-left px-4 py-2.5 min-h-[44px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            {firebaseUser
              ? 'Complete your profile onboarding to publish posts...'
              : 'Sign in to share posts, photos, videos, and follow creators...'}
          </button>
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => navigate(firebaseUser ? '/onboarding' : '/auth')}
            className="px-4 py-2 min-h-[40px] rounded-xl bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            {firebaseUser ? 'Complete onboarding' : 'Sign in to post'}
          </button>
        </div>
      </section>
    );
  }

  const clearPendingMedia = () => {
    pendingMedia.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setPendingMedia([]);
  };

  const handlePhotoFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;

    try {
      const existingImages = pendingMedia.filter((m) => m.kind === 'image');
      // If user previously had a video selected, replace with images
      if (pendingMedia.some((m) => m.kind === 'video')) {
        clearPendingMedia();
      }
      const nextItems: PendingMediaItem[] = [...(pendingMedia.some((m) => m.kind === 'video') ? [] : existingImages)];
      for (const file of files) {
        if (nextItems.length >= SOCIAL_CONSTRAINTS.MEDIA_URLS_MAX) break;
        validateImageFile(file);
        nextItems.push({
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          file,
          previewUrl: URL.createObjectURL(file),
          kind: 'image',
        });
      }
      setPendingMedia(nextItems);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid photo selected.');
    }
  };

  const handleVideoFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      validateVideoFile(file);
      clearPendingMedia();
      setPendingMedia([
        {
          id: `${Date.now()}`,
          file,
          previewUrl: URL.createObjectURL(file),
          kind: 'video',
        },
      ]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid video selected.');
    }
  };

  const removeMediaItem = (id: string) => {
    setPendingMedia((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  };

  const canSubmit = caption.trim().length > 0 || pendingMedia.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setErrorMsg(null);
    setUploadProgress(pendingMedia.length > 0 ? 0 : null);

    try {
      let mediaType: 'text' | 'image' | 'video' = 'text';
      const mediaUrls: string[] = [];

      if (pendingMedia.length > 0) {
        if (pendingMedia[0].kind === 'video') {
          mediaType = 'video';
          const uploaded = await uploadVideoAsset(
            pendingMedia[0].file,
            'p',
            profile.uid,
            (pct) => setUploadProgress(pct)
          );
          mediaUrls.push(uploaded.videoUrl);
        } else {
          mediaType = 'image';
          for (let i = 0; i < pendingMedia.length; i += 1) {
            const url = await uploadImageAsset(
              pendingMedia[i].file,
              'p',
              profile.uid,
              (pct) => {
                const overall = Math.round(((i + pct / 100) / pendingMedia.length) * 100);
                setUploadProgress(overall);
              }
            );
            mediaUrls.push(url);
          }
        }
      }

      const finalCaption =
        caption.trim() ||
        (mediaType === 'video' ? 'Shared a video' : mediaType === 'image' ? 'Shared a photo' : '');

      await createPost(profile, {
        caption: finalCaption,
        visibility,
        sharedPostId,
        mediaType,
        mediaUrls,
      });

      setCaption('');
      clearPendingMedia();
      setUploadProgress(null);
      onPostCreated?.();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to publish post.');
      setUploadProgress(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      aria-label="Create a post"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5"
    >
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handlePhotoFilesSelected}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleVideoFileSelected}
      />

      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-700 dark:text-blue-400 font-display font-bold text-sm shrink-0 overflow-hidden">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={profile.displayName}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              profile.displayName.slice(0, 1).toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <textarea
              rows={3}
              maxLength={SOCIAL_CONSTRAINTS.CAPTION_MAX}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder={`What's on your mind, ${profile.displayName}?`}
              aria-label="Write your post"
              className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15 resize-none"
            />
          </div>
        </div>

        {/* Media Previews */}
        {pendingMedia.length > 0 && (
          <div
            className={`grid gap-2 ${
              pendingMedia.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
            }`}
          >
            {pendingMedia.map((item) => (
              <div
                key={item.id}
                className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-950"
              >
                {item.kind === 'image' ? (
                  <img
                    src={item.previewUrl}
                    alt="Selected upload preview"
                    className="w-full max-h-64 object-cover"
                  />
                ) : (
                  <video
                    src={item.previewUrl}
                    controls
                    playsInline
                    className="w-full max-h-64 object-contain"
                  />
                )}
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => removeMediaItem(item.id)}
                  aria-label="Remove attachment"
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-slate-900/75 text-white flex items-center justify-center hover:bg-slate-900 transition-colors"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}

        {uploadProgress !== null && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
              <span>Uploading media...</span>
              <span className="font-mono tabular-nums">{uploadProgress}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all duration-150"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {errorMsg && (
          <p className="text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl px-3 py-2">
            {errorMsg}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={submitting}
              onClick={() => photoInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              <Image className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              <span>Photo</span>
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => videoInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              <Video className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              <span>Video</span>
            </button>

            <div className="inline-flex items-center gap-1 ml-1">
              {visibility === 'public' ? (
                <Globe className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              ) : (
                <Users className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              )}
              <select
                aria-label="Post visibility"
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as PostVisibility)}
                className="h-9 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 focus:border-blue-600 focus:outline-none"
              >
                <option value="public">Public</option>
                <option value="followers">Followers</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3 ml-auto">
            <span className="text-xs text-slate-400 font-mono tabular-nums">
              {caption.length}/{SOCIAL_CONSTRAINTS.CAPTION_MAX}
            </span>
            <button
              type="submit"
              disabled={submitting || !canSubmit}
              className="inline-flex items-center gap-2 px-4 py-2 min-h-[40px] rounded-xl bg-blue-600 text-white text-xs sm:text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="w-4 h-4" aria-hidden="true" />
              )}
              <span>{submitting ? 'Publishing...' : 'Post'}</span>
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
