import React, { useRef, useState } from 'react';
import {
  Camera,
  Check,
  Clapperboard,
  Film,
  Globe,
  Hash,
  Loader2,
  Lock,
  Music,
  Pause,
  Play,
  RotateCw,
  Sparkles,
  Type,
  Upload,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  MEDIA_LIMITS,
  UploadControlHandle,
  UploadProgressInfo,
  inferMimeType,
  uploadImageAsset,
  uploadVideoAsset,
  validateImageFile,
  validateVideoFile,
} from '../../services/mediaUploadService';
import { createPost } from '../../services/socialService';
import { createStory } from '../../services/storyService';
import { createShortVideo } from '../../services/videoService';

export type UploadCategoryTab = 'short' | 'long' | 'photo' | 'story';

export const MOVIE_GENRES = [
  'Entertainment',
  'Action',
  'Comedy',
  'Drama',
  'Documentary',
  'Music',
  'Education',
  'Tech',
  'Sports',
  'Gaming',
] as const;

export const STORY_TEXT_GRADIENTS = [
  { id: 'blue', label: 'Ocean Blue', css: 'linear-gradient(135deg, #2563eb 0%, #0f172a 100%)' },
  { id: 'sunset', label: 'Sunset', css: 'linear-gradient(135deg, #f97316 0%, #db2777 100%)' },
  { id: 'emerald', label: 'Emerald', css: 'linear-gradient(135deg, #059669 0%, #0f766e 100%)' },
  { id: 'indigo', label: 'Midnight', css: 'linear-gradient(135deg, #4338ca 0%, #020617 100%)' },
] as const;

interface UploadHubModalProps {
  initialCategory?: UploadCategoryTab;
  onClose: () => void;
  onSuccess?: (category: UploadCategoryTab, createdId?: string) => void;
}

function formatBytesMb(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0.0 MB';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSpeed(bytesPerSec: number | null): string {
  if (!bytesPerSec || bytesPerSec <= 0) return '';
  if (bytesPerSec >= 1024 * 1024) {
    return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
  }
  return `${Math.round(bytesPerSec / 1024)} KB/s`;
}

function formatEta(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return '';
  if (seconds < 60) return `~${seconds}s left`;
  const mins = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return `~${mins}m ${rem}s left`;
}

export function UploadHubModal({
  initialCategory = 'short',
  onClose,
  onSuccess,
}: UploadHubModalProps) {
  const { firebaseUser, profile } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadControlRef = useRef<UploadControlHandle | null>(null);
  const submittingLockRef = useRef(false);

  const [category, setCategory] = useState<UploadCategoryTab>(initialCategory);
  const [storyMode, setStoryMode] = useState<'media' | 'text'>('media');
  const [storyBg, setStoryBg] = useState<string>(STORY_TEXT_GRADIENTS[0].css);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [detectedMediaKind, setDetectedMediaKind] = useState<'image' | 'video'>('video');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [genre, setGenre] = useState<string>('Entertainment');
  const [musicTitle, setMusicTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [hashtagsText, setHashtagsText] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'followers'>('public');

  const [progress, setProgress] = useState<number | null>(null);
  const [uploadTelemetry, setUploadTelemetry] = useState<UploadProgressInfo | null>(null);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const clearSelectedFile = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
    setErrorMsg(null);
  };

  const handleCategorySwitch = (next: UploadCategoryTab) => {
    if (uploading) return;
    setCategory(next);
    clearSelectedFile();
    if (next === 'photo') setDetectedMediaKind('image');
    if (next === 'short' || next === 'long') setDetectedMediaKind('video');
  };

  const handleFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const mime = inferMimeType(file);
      if (category === 'photo') {
        validateImageFile(file);
        setDetectedMediaKind('image');
      } else if (category === 'story') {
        if (mime.startsWith('video/')) {
          validateVideoFile(file);
          setDetectedMediaKind('video');
        } else {
          validateImageFile(file);
          setDetectedMediaKind('image');
        }
      } else {
        validateVideoFile(file);
        setDetectedMediaKind('video');
      }
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unsupported media file.');
    }
  };

  const acceptAttr =
    category === 'photo'
      ? 'image/*'
      : category === 'story'
        ? 'image/*,video/*'
        : 'video/*';

  const startPublish = async () => {
    if (submittingLockRef.current) return;
    if (!firebaseUser) {
      onClose();
      navigate('/auth');
      return;
    }
    if (!profile?.onboardingComplete) {
      onClose();
      navigate('/onboarding');
      return;
    }

    if (category === 'story' && storyMode === 'text') {
      if (!caption.trim()) {
        setErrorMsg('Write a message for your text story.');
        return;
      }
    } else if (!selectedFile) {
      setErrorMsg('Please select a file from your device or gallery first.');
      return;
    }

    submittingLockRef.current = true;
    setUploading(true);
    setErrorMsg(null);
    setProgress(0);
    setUploadTelemetry({
      stage: 'pending',
      percent: 0,
      bytesTransferred: 0,
      totalBytes: selectedFile?.size ?? 0,
      speedBytesPerSec: null,
      etaSeconds: null,
    });

    const lifecycle = {
      onDetail: (info: UploadProgressInfo) => setUploadTelemetry(info),
      onControl: (handle: UploadControlHandle) => {
        uploadControlRef.current = handle;
      },
    };

    try {
      let createdId = '';
      if (category === 'short' || category === 'long') {
        const { videoUrl, thumbnailUrl, durationSec } = await uploadVideoAsset(
          selectedFile!,
          'v',
          profile.uid,
          setProgress,
          lifecycle
        );
        createdId = await createShortVideo(profile, {
          caption,
          videoUrl,
          thumbnailUrl,
          durationSec,
          videoFormat: category,
          title: category === 'long' ? title : title.trim() || undefined,
          category: category === 'long' ? genre : undefined,
          hashtags: hashtagsText,
          musicTitle: category === 'short' ? musicTitle : undefined,
          visibility,
        });
      } else if (category === 'photo') {
        const photoUrl = await uploadImageAsset(
          selectedFile!,
          'p',
          profile.uid,
          setProgress,
          undefined,
          lifecycle
        );
        const combinedCaption = [
          caption.trim() || 'Shared a photo on AINEMAX',
          hashtagsText.trim(),
        ]
          .filter(Boolean)
          .join(' ');
        createdId = await createPost(profile, {
          caption: combinedCaption,
          mediaType: 'image',
          mediaUrls: [photoUrl],
          visibility,
        });
      } else {
        if (storyMode === 'text') {
          setProgress(40);
          createdId = await createStory(profile, {
            mediaType: 'text',
            mediaUrl: '',
            backgroundColor: storyBg,
            caption,
          });
          setProgress(100);
        } else {
          let mediaUrl = '';
          if (detectedMediaKind === 'video') {
            const res = await uploadVideoAsset(
              selectedFile!,
              'st',
              profile.uid,
              setProgress,
              lifecycle
            );
            mediaUrl = res.videoUrl;
          } else {
            mediaUrl = await uploadImageAsset(
              selectedFile!,
              'st',
              profile.uid,
              setProgress,
              undefined,
              lifecycle
            );
          }
          createdId = await createStory(profile, {
            mediaType: detectedMediaKind,
            mediaUrl,
            caption,
          });
        }
      }

      clearSelectedFile();
      setProgress(null);
      setUploadTelemetry(null);
      uploadControlRef.current = null;
      onSuccess?.(category, createdId);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed. Please try again.');
      setUploadTelemetry((prev) =>
        prev
          ? { ...prev, stage: 'failed', speedBytesPerSec: null, etaSeconds: null }
          : null
      );
    } finally {
      submittingLockRef.current = false;
      setUploading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void startPublish();
  };

  const handlePauseResume = () => {
    const ctrl = uploadControlRef.current;
    if (!ctrl || !uploadTelemetry) return;
    if (uploadTelemetry.stage === 'paused') {
      ctrl.resume();
    } else if (uploadTelemetry.stage === 'uploading') {
      ctrl.pause();
    }
  };

  const handleCancelActiveUpload = () => {
    uploadControlRef.current?.cancel();
    uploadControlRef.current = null;
  };

  const categories: Array<{
    id: UploadCategoryTab;
    label: string;
    hint: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'short',
      label: 'Short Video',
      hint: '9:16 Clips',
      icon: <Film className="w-4 h-4" aria-hidden="true" />,
    },
    {
      id: 'long',
      label: 'Long / Film',
      hint: '16:9 Movies',
      icon: <Clapperboard className="w-4 h-4" aria-hidden="true" />,
    },
    {
      id: 'photo',
      label: 'Photo',
      hint: 'Feed Post',
      icon: <Camera className="w-4 h-4" aria-hidden="true" />,
    },
    {
      id: 'story',
      label: 'Story',
      hint: '24h Moment',
      icon: <Sparkles className="w-4 h-4" aria-hidden="true" />,
    },
  ];

  const stageLabel =
    uploadTelemetry?.stage === 'preparing'
      ? 'Preparing media...'
      : uploadTelemetry?.stage === 'paused'
        ? 'Upload paused'
        : uploadTelemetry?.stage === 'completed'
          ? 'Completed'
          : uploadTelemetry?.stage === 'failed'
            ? 'Upload failed'
            : 'Uploading to AINEMAX...';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Upload content to AINEMAX"
      className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={() => !uploading && onClose()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg max-h-[92vh] overflow-y-auto p-5 space-y-4 text-slate-900 dark:text-slate-100"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">Create &amp; Upload</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Choose a category to publish directly to AINEMAX
            </p>
          </div>
          <button
            type="button"
            disabled={uploading}
            onClick={onClose}
            aria-label="Close upload dialog"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 4 Upload Categories */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {categories.map((cat) => {
            const active = category === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                disabled={uploading}
                onClick={() => handleCategorySwitch(cat.id)}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  active
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  {cat.icon}
                  {active && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
                </div>
                <p className="text-xs font-bold mt-1.5">{cat.label}</p>
                <p className="text-[11px] opacity-75">{cat.hint}</p>
              </button>
            );
          })}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={acceptAttr}
          className="hidden"
          onChange={handleFileChosen}
        />

        <form onSubmit={handleSubmit} className="space-y-4">
          {category === 'story' && (
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
              <button
                type="button"
                disabled={uploading}
                onClick={() => setStoryMode('media')}
                className={`py-2 rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1.5 ${
                  storyMode === 'media'
                    ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Photo / Video</span>
              </button>
              <button
                type="button"
                disabled={uploading}
                onClick={() => {
                  clearSelectedFile();
                  setStoryMode('text');
                }}
                className={`py-2 rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1.5 ${
                  storyMode === 'text'
                    ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <Type className="w-3.5 h-3.5" />
                <span>Text Story</span>
              </button>
            </div>
          )}

          {category === 'story' && storyMode === 'text' ? (
            <div className="space-y-3">
              <div
                className="rounded-2xl p-6 min-h-[160px] flex items-center justify-center text-center text-white font-bold text-lg shadow-inner"
                style={{ background: storyBg }}
              >
                {caption.trim() || 'Your 24-hour text story preview'}
              </div>
              <div className="flex items-center gap-2">
                {STORY_TEXT_GRADIENTS.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setStoryBg(g.css)}
                    aria-label={g.label}
                    className={`w-9 h-9 rounded-full border-2 transition-transform ${
                      storyBg === g.css ? 'border-slate-900 dark:border-white scale-110' : 'border-white shadow-xs'
                    }`}
                    style={{ background: g.css }}
                  />
                ))}
              </div>
            </div>
          ) : previewUrl ? (
            <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-200 dark:border-slate-700">
              {detectedMediaKind === 'image' ? (
                <img
                  src={previewUrl}
                  alt="Selected upload preview"
                  className="w-full max-h-60 object-contain"
                />
              ) : (
                <video
                  src={previewUrl}
                  controls
                  playsInline
                  className="w-full max-h-60 object-contain"
                />
              )}
              {selectedFile && (
                <div className="absolute bottom-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-slate-900/80 text-white text-[11px] font-mono">
                  {formatBytesMb(selectedFile.size)}
                </div>
              )}
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="absolute top-2.5 right-2.5 px-3 py-1.5 rounded-lg bg-slate-900/80 text-white text-xs font-medium hover:bg-slate-900 disabled:opacity-40"
              >
                Replace file
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-9 px-4 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 hover:bg-blue-50/40 dark:hover:bg-blue-950/30 transition-colors flex flex-col items-center gap-2 text-center"
            >
              <Upload className="w-7 h-7 text-blue-600" aria-hidden="true" />
              <span className="text-sm font-semibold">
                {category === 'photo'
                  ? 'Choose photo from device files or gallery'
                  : category === 'story'
                    ? 'Choose photo or video from files / gallery'
                    : 'Choose video from device files or gallery'}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {category === 'photo'
                  ? `PNG, JPG, WebP, or GIF · up to ${Math.round(MEDIA_LIMITS.IMAGE_MAX_BYTES / 1024 / 1024)}MB`
                  : `MP4, WebM, or MOV · up to ${Math.round(MEDIA_LIMITS.VIDEO_MAX_BYTES / 1024 / 1024)}MB`}
              </span>
            </button>
          )}

          {category === 'long' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="hub-title" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Movie / Video Title
                </label>
                <input
                  id="hub-title"
                  type="text"
                  maxLength={120}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter a title..."
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="hub-genre" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Genre / Category
                </label>
                <select
                  id="hub-genre"
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:border-blue-600 focus:outline-none"
                >
                  {MOVIE_GENRES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {category === 'short' && (
            <div>
              <label htmlFor="hub-music" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Sound / Music Track (optional)
              </label>
              <div className="relative">
                <Music className="w-4 h-4 text-slate-400 absolute left-3 top-3" aria-hidden="true" />
                <input
                  id="hub-music"
                  type="text"
                  maxLength={120}
                  value={musicTitle}
                  onChange={(e) => setMusicTitle(e.target.value)}
                  placeholder="Original Sound — Your Name"
                  className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="hub-caption" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {category === 'story' && storyMode === 'text'
                ? 'Story Message'
                : category === 'long'
                  ? 'Description'
                  : 'Caption'}
            </label>
            <textarea
              id="hub-caption"
              rows={2}
              maxLength={category === 'story' ? 200 : 500}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder={
                category === 'story'
                  ? 'Say what is on your mind...'
                  : 'Write a caption or description...'
              }
              className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:border-blue-600 focus:outline-none resize-none"
            />
          </div>

          {category !== 'story' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="hub-tags" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Hashtags
                </label>
                <div className="relative">
                  <Hash className="w-4 h-4 text-slate-400 absolute left-3 top-3" aria-hidden="true" />
                  <input
                    id="hub-tags"
                    type="text"
                    value={hashtagsText}
                    onChange={(e) => setHashtagsText(e.target.value)}
                    placeholder="#ainemax #music #viral"
                    className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="hub-privacy" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Privacy
                </label>
                <div className="relative">
                  {visibility === 'public' ? (
                    <Globe className="w-4 h-4 text-slate-400 absolute left-3 top-3" aria-hidden="true" />
                  ) : (
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" aria-hidden="true" />
                  )}
                  <select
                    id="hub-privacy"
                    value={visibility}
                    onChange={(e) =>
                      setVisibility(e.target.value === 'followers' ? 'followers' : 'public')
                    }
                    className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:border-blue-600 focus:outline-none"
                  >
                    <option value="public">Public (Everyone)</option>
                    <option value="followers">Followers Only</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Genuine Resumable Upload Progress + Telemetry */}
          {progress !== null && (
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-800 dark:text-slate-200">{stageLabel}</span>
                <span className="font-mono font-bold tabular-nums text-blue-600 dark:text-blue-400">
                  {uploadTelemetry?.percent ?? progress}%
                </span>
              </div>

              <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div
                  className={`h-full transition-all duration-150 ${
                    uploadTelemetry?.stage === 'failed'
                      ? 'bg-red-500'
                      : uploadTelemetry?.stage === 'paused'
                        ? 'bg-amber-500'
                        : 'bg-blue-600'
                  }`}
                  style={{ width: `${uploadTelemetry?.percent ?? progress}%` }}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                <span>
                  {uploadTelemetry && uploadTelemetry.totalBytes > 0
                    ? `${formatBytesMb(uploadTelemetry.bytesTransferred)} / ${formatBytesMb(uploadTelemetry.totalBytes)}`
                    : 'Preparing transfer'}
                </span>
                <div className="flex items-center gap-2">
                  {formatSpeed(uploadTelemetry?.speedBytesPerSec ?? null) && (
                    <span>{formatSpeed(uploadTelemetry?.speedBytesPerSec ?? null)}</span>
                  )}
                  {formatEta(uploadTelemetry?.etaSeconds ?? null) && (
                    <span>· {formatEta(uploadTelemetry?.etaSeconds ?? null)}</span>
                  )}
                </div>
              </div>

              {uploading && uploadControlRef.current && (
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handlePauseResume}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-[11px] font-semibold hover:bg-slate-100 dark:hover:bg-slate-700"
                  >
                    {uploadTelemetry?.stage === 'paused' ? (
                      <>
                        <Play className="w-3 h-3" />
                        <span>Resume</span>
                      </>
                    ) : (
                      <>
                        <Pause className="w-3 h-3" />
                        <span>Pause</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelActiveUpload}
                    className="px-2.5 py-1 rounded-lg border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 text-[11px] font-semibold hover:bg-red-50 dark:hover:bg-red-950/40"
                  >
                    Cancel Upload
                  </button>
                </div>
              )}
            </div>
          )}

          {errorMsg && (
            <div className="text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl px-3 py-2.5 flex items-center justify-between gap-2">
              <span>{errorMsg}</span>
              {!uploading && selectedFile && (
                <button
                  type="button"
                  onClick={() => void startPublish()}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-600 text-white font-semibold shrink-0 hover:bg-red-700"
                >
                  <RotateCw className="w-3 h-3" />
                  <span>Retry</span>
                </button>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={uploading}
              onClick={onClose}
              className="px-4 py-2.5 min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading}
              className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[42px] rounded-xl bg-blue-600 text-white text-xs sm:text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{uploading ? 'Publishing...' : 'Publish'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
