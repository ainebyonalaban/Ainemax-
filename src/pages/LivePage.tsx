import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Camera,
  CameraOff,
  Check,
  Eye,
  Gift,
  Heart,
  ImagePlus,
  Loader2,
  Maximize,
  Mic,
  MicOff,
  Minimize,
  PowerOff,
  Radio,
  RefreshCw,
  Send,
  Share2,
  SwitchCamera,
  UserCheck,
  UserPlus,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  LocalAudioTrack,
  LocalVideoTrack,
  Participant,
  RemoteTrack,
  RemoteTrackPublication,
  Room,
  RoomEvent,
  Track,
  createLocalAudioTrack,
  createLocalVideoTrack,
} from 'livekit-client';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  adjustStreamViewerCount,
  endLiveStreamRoom,
  fetchPlatformSettings,
  incrementLiveLike,
  sendLiveComment,
  startLiveStreamRoom,
  subscribeLiveComments,
  subscribeLiveStreams,
} from '../services/liveAndAdminService';
import {
  CameraFacingMode,
  MediaDeviceDiagnostic,
  attachStreamAudioLevel,
  formatMediaDeviceError,
  inspectMediaEnvironment,
  requestCameraAndMicStream,
  stopMediaStream,
} from '../services/mediaDevicesService';
import { uploadImageAsset, validateImageFile } from '../services/mediaUploadService';
import {
  fetchUserProfileById,
  followUser,
  subscribeUserFollowing,
  unfollowUser,
} from '../services/socialService';
import { LiveComment, LiveStream } from '../types/features';

interface LiveKitServerState {
  checked: boolean;
  configured: boolean;
  verified: boolean;
  livekitUrl: string | null;
  errorCode?: string | null;
  error?: string | null;
}

function formatLiveKitConnectionError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err || '');
  const lower = raw.toLowerCase();
  if (lower.includes('invalid api key')) {
    return 'LiveKit Cloud rejected the server API key ("invalid API key"). Verify LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET all belong to the same active LiveKit Cloud project (Settings -> Keys).';
  }
  if (lower.includes('invalid signature') || lower.includes('invalid token')) {
    return 'LiveKit Cloud rejected the signed access token. Verify LIVEKIT_API_SECRET matches your active LIVEKIT_API_KEY in LiveKit Cloud -> Settings -> Keys.';
  }
  if (lower.includes('could not establish signal connection')) {
    return `${raw} — Check that LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET are valid and belong to the same LiveKit Cloud project.`;
  }
  return raw || 'Unable to establish live WebRTC audio/video connection.';
}

interface FloatingHeart {
  id: number;
  offsetX: number;
}

const LIVE_CATEGORIES = ['All', 'Community', 'Music', 'Tech', 'Gaming', 'News'] as const;
const LIVE_GIFTS = [
  { label: 'Rose 🌹', text: 'sent a Rose 🌹' },
  { label: 'Fire 🔥', text: 'sent Fire 🔥' },
  { label: 'Star ⭐', text: 'sent a Star ⭐' },
  { label: 'Crown 👑', text: 'sent a Crown 👑' },
] as const;

export function LivePage() {
  const { firebaseUser, isVerifiedIdentity, profile, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [activeStream, setActiveStream] = useState<LiveStream | null>(null);
  const [firestoreComments, setFirestoreComments] = useState<LiveComment[]>([]);
  const [realtimeDataComments, setRealtimeDataComments] = useState<
    Array<LiveComment & { localOrderMs: number }>
  >([]);
  const [commentText, setCommentText] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());

  const [livekitStatus, setLivekitStatus] = useState<LiveKitServerState>({
    checked: false,
    configured: false,
    verified: false,
    livekitUrl: null,
    errorCode: null,
    error: null,
  });
  const [liveAllowed, setLiveAllowed] = useState(true);

  // Pre-Live Setup Screen State
  const [setupOpen, setSetupOpen] = useState(false);
  const [facingMode, setFacingMode] = useState<CameraFacingMode>('user');
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<MediaDeviceDiagnostic | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Community');
  const [visibility, setVisibility] = useState<'public' | 'followers'>('public');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [starting, setStarting] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);

  // Active LiveKit Broadcast / Viewer Room State
  const liveRoomShellRef = useRef<HTMLDivElement>(null);
  const commentsListRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<Room | null>(null);
  const localVideoTrackRef = useRef<LocalVideoTrack | null>(null);
  const localAudioTrackRef = useRef<LocalAudioTrack | null>(null);
  const stageVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioContainerRef = useRef<HTMLDivElement>(null);

  const [rtcState, setRtcState] = useState<
    'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'
  >('idle');
  const [rtcError, setRtcError] = useState<string | null>(null);
  const [audioPlaybackBlocked, setAudioPlaybackBlocked] = useState(false);
  const [remoteVideoReady, setRemoteVideoReady] = useState(false);
  const [remoteAudioMuted, setRemoteAudioMuted] = useState(false);
  const remoteAudioMutedRef = useRef(false);
  useEffect(() => {
    remoteAudioMutedRef.current = remoteAudioMuted;
  }, [remoteAudioMuted]);
  const [liveParticipantCount, setLiveParticipantCount] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [hostMicOn, setHostMicOn] = useState(true);
  const [hostCamOn, setHostCamOn] = useState(true);
  const [hostFacing, setHostFacing] = useState<CameraFacingMode>('user');
  const [switchingCamera, setSwitchingCamera] = useState(false);

  const [giftTrayOpen, setGiftTrayOpen] = useState(false);
  const [sharedCopied, setSharedCopied] = useState(false);
  const [floatingHearts, setFloatingHearts] = useState<FloatingHeart[]>([]);

  // Subscribe to Firestore live streams + check LiveKit server status
  useEffect(() => {
    const unsub = subscribeLiveStreams((list) => {
      setStreams(list);
      setActiveStream((curr) =>
        curr ? list.find((s) => s.id === curr.id) ?? curr : null
      );
    });
    fetch('/api/livekit/status')
      .then((r) => r.json())
      .then(
        (data: {
          configured?: boolean;
          verified?: boolean;
          livekitUrl?: string | null;
          errorCode?: string | null;
          error?: string | null;
        }) => {
          setLivekitStatus({
            checked: true,
            configured: Boolean(data.configured),
            verified: Boolean(data.verified),
            livekitUrl: data.livekitUrl || null,
            errorCode: data.errorCode ?? null,
            error: data.error ?? null,
          });
        }
      )
      .catch(() => {
        setLivekitStatus({
          checked: true,
          configured: false,
          verified: false,
          livekitUrl: null,
          errorCode: 'STATUS_UNREACHABLE',
          error: 'Unable to check LiveKit server status.',
        });
      });
    fetchPlatformSettings().then((settings) => {
      if (settings) setLiveAllowed(settings.allowLiveStreaming);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!firebaseUser || !isVerifiedIdentity) return;
    const unsub = subscribeUserFollowing(firebaseUser.uid, setFollowingIds);
    return () => unsub();
  }, [firebaseUser, isVerifiedIdentity]);

  const activeStreamId = activeStream?.id ?? null;

  useEffect(() => {
    setFirestoreComments([]);
    setRealtimeDataComments([]);
    setCommentError(null);
    if (!activeStreamId) {
      return;
    }
    const unsub = subscribeLiveComments(activeStreamId, setFirestoreComments);
    return () => unsub();
  }, [activeStreamId]);

  const comments = useMemo(() => {
    const byId = new Map<string, LiveComment>();
    firestoreComments.forEach((c) => byId.set(c.id, c));
    realtimeDataComments.forEach((c) => {
      if (!byId.has(c.id)) {
        byId.set(c.id, c);
      }
    });
    const toTime = (c: LiveComment & { localOrderMs?: number }) =>
      c.createdAt && typeof c.createdAt.toMillis === 'function'
        ? c.createdAt.toMillis()
        : c.localOrderMs ?? Date.now();
    return Array.from(byId.values()).sort((a, b) => toTime(a) - toTime(b));
  }, [firestoreComments, realtimeDataComments]);

  // Auto-scroll received live messages to the bottom of the screen
  useEffect(() => {
    const el = commentsListRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [comments.length, activeStreamId]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Pre-Live camera + microphone preview lifecycle
  const stopPreviewHardware = useCallback(() => {
    stopMediaStream(previewStreamRef.current);
    previewStreamRef.current = null;
    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = null;
    }
    setMicLevel(0);
  }, []);

  const startPreviewHardware = useCallback(
    async (targetFacing: CameraFacingMode, wantVideo: boolean, wantAudio: boolean) => {
      if (!wantVideo && !wantAudio) {
        stopPreviewHardware();
        return;
      }
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        await inspectMediaEnvironment();
        const stream = await requestCameraAndMicStream({
          facingMode: targetFacing,
          video: wantVideo,
          audio: wantAudio,
          existingStream: previewStreamRef.current,
        });
        previewStreamRef.current = stream;
        if (previewVideoRef.current) {
          previewVideoRef.current.srcObject = wantVideo ? stream : null;
          if (wantVideo) {
            void previewVideoRef.current.play().catch(() => undefined);
          }
        }
      } catch (err) {
        stopPreviewHardware();
        setPreviewError(formatMediaDeviceError(err));
      } finally {
        setPreviewLoading(false);
      }
    },
    [stopPreviewHardware]
  );

  // Audio level meter when preview stream is active
  useEffect(() => {
    if (!setupOpen || !micEnabled || !previewStreamRef.current) {
      setMicLevel(0);
      return;
    }
    return attachStreamAudioLevel(previewStreamRef.current, setMicLevel);
  }, [setupOpen, micEnabled, previewLoading]);

  // Guaranteed cleanup on unmount
  const disconnectRoom = useCallback(async () => {
    if (localVideoTrackRef.current) {
      localVideoTrackRef.current.detach();
      localVideoTrackRef.current.stop();
      localVideoTrackRef.current = null;
    }
    if (localAudioTrackRef.current) {
      localAudioTrackRef.current.detach();
      localAudioTrackRef.current.stop();
      localAudioTrackRef.current = null;
    }
    if (stageVideoRef.current) {
      stageVideoRef.current.srcObject = null;
    }
    if (remoteAudioContainerRef.current) {
      remoteAudioContainerRef.current.innerHTML = '';
    }
    if (roomRef.current) {
      try {
        await roomRef.current.disconnect();
      } catch {
        // Ignore disconnect errors
      }
      roomRef.current = null;
    }
    setRtcState('idle');
    setRtcError(null);
    setAudioPlaybackBlocked(false);
    setRemoteVideoReady(false);
  }, []);

  useEffect(() => {
    return () => {
      stopPreviewHardware();
      void disconnectRoom();
    };
  }, [stopPreviewHardware, disconnectRoom]);

  const requestSignedLiveKitToken = async (
    streamId: string,
    role: 'host' | 'viewer'
  ): Promise<{ token: string; livekitUrl: string }> => {
    if (!firebaseUser) {
      throw new Error('Sign in to connect to live audio and video.');
    }
    const idToken = await firebaseUser.getIdToken();
    const resp = await fetch('/api/livekit/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ roomId: streamId, role }),
    });
    const data = (await resp.json()) as {
      token?: string;
      livekitUrl?: string;
      error?: string;
    };
    if (!resp.ok || !data.token || !data.livekitUrl) {
      throw new Error(data.error || 'Unable to obtain LiveKit broadcast access token.');
    }
    return { token: data.token, livekitUrl: data.livekitUrl };
  };

  const attachTrackToDom = useCallback(
    (track: RemoteTrack, isMutedOverride = false) => {
      if (track.kind === Track.Kind.Video && stageVideoRef.current) {
        track.attach(stageVideoRef.current);
        setRemoteVideoReady(true);
      } else if (track.kind === Track.Kind.Audio && remoteAudioContainerRef.current) {
        const audioEl = track.attach() as HTMLAudioElement;
        audioEl.autoplay = true;
        audioEl.muted = isMutedOverride;
        audioEl.dataset.trackSid = track.sid || '';
        remoteAudioContainerRef.current.appendChild(audioEl);
      }
    },
    []
  );

  const detachTrackFromDom = useCallback((track: RemoteTrack) => {
    track.detach().forEach((el) => el.remove());
    if (track.kind === Track.Kind.Video) {
      setRemoteVideoReady(false);
    }
  }, []);

  const connectLiveKitSession = useCallback(
    async (
      streamId: string,
      role: 'host' | 'viewer',
      initialOptions?: { cam: boolean; mic: boolean; facing: CameraFacingMode }
    ) => {
      await disconnectRoom();
      setRtcState('connecting');
      setRtcError(null);
      setAudioPlaybackBlocked(false);
      setRemoteVideoReady(false);

      try {
        const { token, livekitUrl } = await requestSignedLiveKitToken(streamId, role);
        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
          publishDefaults: {
            simulcast: true,
          },
        });
        roomRef.current = room;

        const updateCount = () => {
          setLiveParticipantCount(1 + room.remoteParticipants.size);
        };

        room.on(RoomEvent.ParticipantConnected, (_p: Participant) => updateCount());
        room.on(RoomEvent.ParticipantDisconnected, (_p: Participant) => updateCount());
        room.on(RoomEvent.Reconnecting, () => setRtcState('reconnecting'));
        room.on(RoomEvent.Reconnected, () => setRtcState('connected'));
        room.on(RoomEvent.Disconnected, () => {
          setRtcState('idle');
        });
        room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
          setAudioPlaybackBlocked(!room.canPlaybackAudio);
        });

        room.on(
          RoomEvent.TrackSubscribed,
          (track: RemoteTrack, _pub: RemoteTrackPublication) => {
            if (role === 'viewer') {
              attachTrackToDom(track, remoteAudioMutedRef.current);
            }
          }
        );

        room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
          if (role === 'viewer') {
            detachTrackFromDom(track);
          }
        });

        room.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
          try {
            const decoded = JSON.parse(new TextDecoder().decode(payload)) as {
              type?: string;
              comment?: LiveComment & { localOrderMs?: number };
            };
            if (decoded?.type === 'live_comment' && decoded.comment?.id && decoded.comment.content) {
              const incomingComment: LiveComment & { localOrderMs: number } = {
                ...decoded.comment,
                localOrderMs:
                  typeof decoded.comment.localOrderMs === 'number'
                    ? decoded.comment.localOrderMs
                    : Date.now(),
              };
              setRealtimeDataComments((prev) => {
                if (prev.some((item) => item.id === incomingComment.id)) return prev;
                return [...prev.slice(-120), incomingComment];
              });
            }
          } catch {
            // Ignore malformed non-chat data packets
          }
        });

        await room.connect(livekitUrl, token);
        setRtcState('connected');
        updateCount();
        setAudioPlaybackBlocked(!room.canPlaybackAudio);

        if (role === 'host') {
          const wantCam = initialOptions?.cam ?? true;
          const wantMic = initialOptions?.mic ?? true;
          const initialFacing = initialOptions?.facing ?? 'user';
          setHostCamOn(wantCam);
          setHostMicOn(wantMic);
          setHostFacing(initialFacing);

          if (wantCam) {
            const videoTrack = await createLocalVideoTrack({
              facingMode: initialFacing,
              resolution: { width: 1280, height: 720, frameRate: 30 },
            });
            localVideoTrackRef.current = videoTrack;
            if (stageVideoRef.current) {
              videoTrack.attach(stageVideoRef.current);
            }
            await room.localParticipant.publishTrack(videoTrack);
          }

          if (wantMic) {
            const audioTrack = await createLocalAudioTrack({
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            });
            localAudioTrackRef.current = audioTrack;
            await room.localParticipant.publishTrack(audioTrack);
          }
        } else {
          // Viewer: subscribe any tracks already published in room
          room.remoteParticipants.forEach((participant) => {
            participant.trackPublications.forEach((pub) => {
              if (pub.isSubscribed && pub.track) {
                attachTrackToDom(pub.track as RemoteTrack, remoteAudioMutedRef.current);
              }
            });
          });
        }
      } catch (err) {
        setRtcState('error');
        setRtcError(formatLiveKitConnectionError(err));
      }
    },
    [attachTrackToDom, detachTrackFromDom, disconnectRoom]
  );

  const openSetupScreen = () => {
    if (!firebaseUser) {
      navigate('/auth');
      return;
    }
    if (!profile?.onboardingComplete) {
      navigate('/onboarding');
      return;
    }
    if (!liveAllowed) {
      setLaunchError('Live streaming is currently disabled by platform administrators.');
    } else {
      setLaunchError(null);
    }
    setSetupOpen(true);
    setCameraEnabled(true);
    setMicEnabled(true);
    setFacingMode('user');
    void startPreviewHardware('user', true, true);
  };

  const closeSetupScreen = () => {
    stopPreviewHardware();
    setSetupOpen(false);
    if (coverPreviewUrl) {
      URL.revokeObjectURL(coverPreviewUrl);
      setCoverPreviewUrl(null);
    }
    setCoverFile(null);
  };

  const handleToggleSetupCamera = () => {
    const next = !cameraEnabled;
    setCameraEnabled(next);
    void startPreviewHardware(facingMode, next, micEnabled);
  };

  const handleToggleSetupMic = () => {
    const next = !micEnabled;
    setMicEnabled(next);
    if (previewStreamRef.current) {
      const audioTracks = previewStreamRef.current.getAudioTracks();
      if (audioTracks.length > 0) {
        audioTracks.forEach((t) => {
          t.enabled = next;
        });
        return;
      }
    }
    void startPreviewHardware(facingMode, cameraEnabled, next);
  };

  const handleSwitchSetupCamera = () => {
    const nextFacing: CameraFacingMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextFacing);
    void startPreviewHardware(nextFacing, true, micEnabled);
  };

  const handleCoverChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      validateImageFile(file);
      if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
      setCoverFile(file);
      setCoverPreviewUrl(URL.createObjectURL(file));
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : 'Invalid cover image.');
    }
  };

  const handleLaunchBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !firebaseUser) return;
    if (!liveAllowed) {
      setLaunchError('Live streaming is currently disabled by administrators.');
      return;
    }
    if (title.trim().length < 2) {
      setLaunchError('Please enter a LIVE title (at least 2 characters).');
      return;
    }
    setStarting(true);
    setLaunchError(null);

    try {
      const statusResp = await fetch('/api/livekit/status');
      const statusData = (await statusResp.json()) as {
        configured?: boolean;
        verified?: boolean;
        livekitUrl?: string | null;
        errorCode?: string | null;
        error?: string | null;
      };
      setLivekitStatus({
        checked: true,
        configured: Boolean(statusData.configured),
        verified: Boolean(statusData.verified),
        livekitUrl: statusData.livekitUrl || null,
        errorCode: statusData.errorCode ?? null,
        error: statusData.error ?? null,
      });
      if (!statusData.configured || !statusData.verified) {
        setLaunchError(
          statusData.error ||
            'LiveKit credentials could not be verified. Check LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET.'
        );
        return;
      }

      // Release setup preview stream BEFORE starting LiveKit capture so Android Chrome hardware doesn't collide
      stopPreviewHardware();

      let coverUrl = '';
      if (coverFile) {
        coverUrl = await uploadImageAsset(coverFile, 'live', profile.uid);
      }
      const streamId = await startLiveStreamRoom(profile, {
        title,
        category,
        coverUrl,
        visibility,
      });

      const optimisticRoom: LiveStream = {
        id: streamId,
        hostId: profile.uid,
        hostUsername: profile.username,
        hostDisplayName: profile.displayName,
        hostAvatarUrl: profile.avatarUrl,
        hostVerified: profile.isVerified,
        title: title.trim(),
        category,
        coverUrl,
        visibility,
        status: 'live',
        viewerCount: 1,
        likesCount: 0,
        createdAt: { toDate: () => new Date() } as LiveStream['createdAt'],
        updatedAt: { toDate: () => new Date() } as LiveStream['updatedAt'],
      };

      setSetupOpen(false);
      setTitle('');
      if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
      setCoverPreviewUrl(null);
      setCoverFile(null);

      setActiveStream(optimisticRoom);
      setSearchParams({ room: streamId }, { replace: true });
      await connectLiveKitSession(streamId, 'host', {
        cam: cameraEnabled,
        mic: micEnabled,
        facing: facingMode,
      });
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : 'Unable to start live stream.');
    } finally {
      setStarting(false);
    }
  };

  const handleJoinStream = useCallback(
    async (stream: LiveStream) => {
      if (stream.status !== 'live') {
        setActiveStream(stream);
        return;
      }
      if (!firebaseUser) {
        navigate('/auth');
        return;
      }
      setActiveStream(stream);
      setSearchParams({ room: stream.id }, { replace: true });
      const role: 'host' | 'viewer' = stream.hostId === firebaseUser.uid ? 'host' : 'viewer';
      if (role === 'viewer') {
        void adjustStreamViewerCount(stream.id, 1);
      }
      await connectLiveKitSession(stream.id, role, {
        cam: true,
        mic: true,
        facing: 'user',
      });
    },
    [connectLiveKitSession, firebaseUser, navigate, setSearchParams]
  );

  // Support deep link /live?room=<id>
  useEffect(() => {
    const requestedRoom = searchParams.get('room');
    if (!requestedRoom || activeStream || streams.length === 0) return;
    const target = streams.find((s) => s.id === requestedRoom);
    if (target) {
      void handleJoinStream(target);
    }
  }, [searchParams, activeStream, streams, handleJoinStream]);

  const handleExitRoom = async () => {
    const current = activeStream;
    await disconnectRoom();
    if (
      current &&
      firebaseUser &&
      current.status === 'live' &&
      current.hostId !== firebaseUser.uid
    ) {
      void adjustStreamViewerCount(current.id, -1);
    }
    setActiveStream(null);
    setSearchParams({}, { replace: true });
  };

  const handleEndBroadcastAsHost = async () => {
    if (!activeStream) return;
    const id = activeStream.id;
    await disconnectRoom();
    await endLiveStreamRoom(id);
    setActiveStream(null);
    setSearchParams({}, { replace: true });
  };

  // In-room host media controls
  const handleToggleLiveMic = async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !hostMicOn;
    setHostMicOn(next);
    try {
      if (localAudioTrackRef.current) {
        if (next) await localAudioTrackRef.current.unmute();
        else await localAudioTrackRef.current.mute();
      } else if (next) {
        const audioTrack = await createLocalAudioTrack({
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        });
        localAudioTrackRef.current = audioTrack;
        await room.localParticipant.publishTrack(audioTrack);
      }
    } catch {
      setHostMicOn(!next);
    }
  };

  const handleToggleLiveCam = async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !hostCamOn;
    setHostCamOn(next);
    try {
      if (localVideoTrackRef.current) {
        if (next) {
          await localVideoTrackRef.current.unmute();
          if (stageVideoRef.current) localVideoTrackRef.current.attach(stageVideoRef.current);
        } else {
          await localVideoTrackRef.current.mute();
        }
      } else if (next) {
        const videoTrack = await createLocalVideoTrack({
          facingMode: hostFacing,
          resolution: { width: 1280, height: 720, frameRate: 30 },
        });
        localVideoTrackRef.current = videoTrack;
        if (stageVideoRef.current) videoTrack.attach(stageVideoRef.current);
        await room.localParticipant.publishTrack(videoTrack);
      }
    } catch {
      setHostCamOn(!next);
    }
  };

  const handleSwitchLiveCamera = async () => {
    const track = localVideoTrackRef.current;
    if (!track || switchingCamera) return;
    const nextFacing: CameraFacingMode = hostFacing === 'user' ? 'environment' : 'user';
    setSwitchingCamera(true);
    try {
      await track.restartTrack({
        facingMode: nextFacing,
        resolution: { width: 1280, height: 720, frameRate: 30 },
      });
      setHostFacing(nextFacing);
    } catch (err) {
      setRtcError(formatMediaDeviceError(err).message);
    } finally {
      setSwitchingCamera(false);
    }
  };

  const handleToggleViewerAudioMute = () => {
    const nextMuted = !remoteAudioMuted;
    setRemoteAudioMuted(nextMuted);
    if (remoteAudioContainerRef.current) {
      const audioEls = remoteAudioContainerRef.current.querySelectorAll('audio');
      audioEls.forEach((a) => {
        a.muted = nextMuted;
      });
    }
  };

  const handleUnlockAudio = async () => {
    if (!roomRef.current) return;
    try {
      await roomRef.current.startAudio();
      setAudioPlaybackBlocked(false);
    } catch {
      setAudioPlaybackBlocked(true);
    }
  };

  const handleSendLikeReaction = () => {
    if (!activeStream || activeStream.status !== 'live') return;
    const heartId = Date.now() + Math.random();
    const offsetX = Math.round((Math.random() - 0.5) * 36);
    setFloatingHearts((prev) => [...prev.slice(-10), { id: heartId, offsetX }]);
    window.setTimeout(() => {
      setFloatingHearts((prev) => prev.filter((h) => h.id !== heartId));
    }, 1000);
    setActiveStream((curr) =>
      curr ? { ...curr, likesCount: (curr.likesCount ?? 0) + 1 } : curr
    );
    void incrementLiveLike(activeStream.id);
  };

  const publishRealtimeComment = useCallback(
    async (text: string, kind: 'chat' | 'gift') => {
      if (!profile || !activeStream) return;
      const clientCommentId = `lc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const localOrderMs = Date.now();
      const optimisticComment: LiveComment & { localOrderMs: number } = {
        id: clientCommentId,
        streamId: activeStream.id,
        authorId: profile.uid,
        authorUsername: profile.username,
        authorDisplayName: profile.displayName,
        content: text.trim().slice(0, 400),
        kind,
        localOrderMs,
        createdAt: { toMillis: () => localOrderMs } as LiveComment['createdAt'],
      };

      setCommentError(null);
      setRealtimeDataComments((prev) => [...prev.slice(-120), optimisticComment]);

      if (roomRef.current?.state === 'connected') {
        try {
          const encoded = new TextEncoder().encode(
            JSON.stringify({ type: 'live_comment', comment: optimisticComment })
          );
          void roomRef.current.localParticipant.publishData(encoded, { reliable: true });
        } catch {
          // Firestore persistence still delivers below
        }
      }

      try {
        await sendLiveComment(activeStream.id, profile, text, kind, clientCommentId);
      } catch (err) {
        setCommentError(
          err instanceof Error ? err.message : 'Unable to send message. Verify your account and retry.'
        );
      }
    },
    [profile, activeStream]
  );

  const handleSendComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) {
      navigate('/auth');
      return;
    }
    if (!profile || !activeStream || !commentText.trim()) return;
    const text = commentText.trim();
    setCommentText('');
    await publishRealtimeComment(text, 'chat');
  };

  const handleSendGift = async (giftText: string) => {
    if (!firebaseUser || !profile || !activeStream) return;
    setGiftTrayOpen(false);
    await publishRealtimeComment(giftText, 'gift');
    handleSendLikeReaction();
  };

  const handleToggleFullscreen = async () => {
    const shell = liveRoomShellRef.current;
    if (!shell) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (shell.requestFullscreen) {
        await shell.requestFullscreen();
      }
    } catch {
      // Ignore fullscreen denial on browsers that restrict it
    }
  };

  const handleFollowHost = async () => {
    if (!activeStream || !profile) return;
    if (followingIds.has(activeStream.hostId)) {
      await unfollowUser(profile.uid, activeStream.hostId);
    } else {
      const target = await fetchUserProfileById(activeStream.hostId);
      if (target) await followUser(profile, target);
    }
  };

  const liveStreams = useMemo(
    () =>
      streams.filter(
        (s) =>
          s.status === 'live' &&
          (categoryFilter === 'All' || s.category.toLowerCase() === categoryFilter.toLowerCase())
      ),
    [streams, categoryFilter]
  );

  const endedStreams = useMemo(
    () =>
      streams
        .filter(
          (s) =>
            s.status === 'ended' &&
            (categoryFilter === 'All' || s.category.toLowerCase() === categoryFilter.toLowerCase())
        )
        .slice(0, 6),
    [streams, categoryFilter]
  );

  // Full-Screen TikTok-Style Interactive LIVE Screen
  if (activeStream) {
    const isHost = firebaseUser?.uid === activeStream.hostId;
    const isFollowingHost = followingIds.has(activeStream.hostId);
    const displayViewers = Math.max(activeStream.viewerCount, liveParticipantCount);

    return (
      <div
        ref={liveRoomShellRef}
        className="fixed inset-0 z-[70] w-screen h-[100dvh] bg-black text-white overflow-hidden select-none"
      >
        {/* Hidden Remote Audio Mount (Viewer only — prevents host echo/feedback) */}
        <div ref={remoteAudioContainerRef} className="hidden" aria-hidden="true" />

        {/* Full-Screen Live Video Canvas covering entire viewport */}
        <div className="absolute inset-0 w-full h-full bg-black">
          <video
            ref={stageVideoRef}
            autoPlay
            playsInline
            muted
            className={`absolute inset-0 w-full h-full object-cover ${
              isHost && hostFacing === 'user' ? '-scale-x-100' : ''
            }`}
          />

          {/* Cover / Placeholder state when waiting for video track or audio-only */}
          {((isHost && !hostCamOn) || (!isHost && !remoteVideoReady)) && (
            <div className="absolute inset-0 bg-gradient-to-b from-slate-900 via-slate-950 to-black flex flex-col items-center justify-center p-6 text-center space-y-3">
              {activeStream.coverUrl ? (
                <img
                  src={activeStream.coverUrl}
                  alt={activeStream.title}
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 w-full h-full object-cover opacity-35"
                />
              ) : null}
              <div className="relative z-10 flex flex-col items-center space-y-3">
                <div className="w-20 h-20 rounded-full bg-blue-600 border-4 border-white/25 text-white font-bold text-2xl flex items-center justify-center overflow-hidden">
                  {activeStream.hostAvatarUrl ? (
                    <img
                      src={activeStream.hostAvatarUrl}
                      alt={activeStream.hostDisplayName}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    activeStream.hostDisplayName.slice(0, 1).toUpperCase()
                  )}
                </div>
                <h2 className="text-lg font-bold">{activeStream.title}</h2>
                <p className="text-xs text-slate-300 max-w-xs">
                  {activeStream.status === 'ended'
                    ? 'This LIVE broadcast has ended. Browse live chat history below.'
                    : isHost && !hostCamOn
                      ? 'Camera is turned off. Your microphone audio remains active.'
                      : rtcState === 'connecting'
                        ? 'Connecting to LiveKit audio & video...'
                        : 'Waiting for broadcaster camera feed...'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Top Header Overlay + Connection / Audio Alerts */}
        <div className="absolute top-0 inset-x-0 z-20 pointer-events-none">
          <header className="pointer-events-auto p-3 sm:p-4 bg-gradient-to-b from-black/85 via-black/40 to-transparent flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => navigate(`/u/${activeStream.hostUsername}`)}
                className="flex items-center gap-2 bg-black/50 backdrop-blur-md border border-white/15 rounded-full pl-1.5 pr-3 py-1 min-w-0"
              >
                <div className="w-9 h-9 rounded-full bg-blue-600 font-bold text-xs flex items-center justify-center overflow-hidden shrink-0">
                  {activeStream.hostAvatarUrl ? (
                    <img
                      src={activeStream.hostAvatarUrl}
                      alt={activeStream.hostDisplayName}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    activeStream.hostDisplayName.slice(0, 1).toUpperCase()
                  )}
                </div>
                <div className="text-left min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-bold truncate max-w-[110px]">
                      {activeStream.hostDisplayName}
                    </span>
                    {activeStream.hostVerified && (
                      <BadgeCheck className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-300 tabular-nums">
                    {(activeStream.likesCount ?? 0).toLocaleString()} likes
                  </p>
                </div>
              </button>

              {!isHost && (
                <button
                  type="button"
                  onClick={() => void handleFollowHost()}
                  className={`px-3 py-2 min-h-[38px] rounded-full text-xs font-semibold transition-colors ${
                    isFollowingHost
                      ? 'bg-white/20 text-white hover:bg-white/30'
                      : 'bg-blue-600 text-white hover:bg-blue-500'
                  }`}
                >
                  {isFollowingHost ? (
                    <span className="inline-flex items-center gap-1">
                      <UserCheck className="w-3.5 h-3.5" />
                      Following
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <UserPlus className="w-3.5 h-3.5" />
                      Follow
                    </span>
                  )}
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold ${
                  activeStream.status === 'live' ? 'bg-red-600 text-white' : 'bg-slate-700 text-slate-200'
                }`}
              >
                <Radio className="w-3 h-3" />
                <span>{activeStream.status === 'live' ? 'LIVE' : 'ENDED'}</span>
              </span>

              <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-black/55 backdrop-blur-md text-xs font-semibold tabular-nums">
                <Eye className="w-3.5 h-3.5 text-blue-400" />
                <span>{displayViewers}</span>
              </span>

              {!isHost && activeStream.status === 'live' && (
                <button
                  type="button"
                  onClick={handleToggleViewerAudioMute}
                  aria-label={remoteAudioMuted ? 'Unmute live audio' : 'Mute live audio'}
                  className="w-10 h-10 rounded-full bg-black/55 hover:bg-black/75 flex items-center justify-center"
                >
                  {remoteAudioMuted ? (
                    <VolumeX className="w-4 h-4 text-red-400" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={() => void handleToggleFullscreen()}
                aria-label={isFullscreen ? 'Exit browser fullscreen' : 'Enter browser fullscreen'}
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                className="w-10 h-10 rounded-full bg-black/55 hover:bg-black/75 flex items-center justify-center"
              >
                {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
              </button>

              {(isHost || isAdmin) && activeStream.status === 'live' ? (
                <button
                  type="button"
                  onClick={() => void handleEndBroadcastAsHost()}
                  className="inline-flex items-center gap-1 px-3 py-2 min-h-[40px] rounded-xl bg-red-600 hover:bg-red-500 text-xs font-bold"
                >
                  <PowerOff className="w-3.5 h-3.5" />
                  <span>End</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleExitRoom()}
                  aria-label="Exit LIVE stream"
                  className="w-10 h-10 rounded-full bg-black/55 hover:bg-black/80 flex items-center justify-center"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          </header>

          {/* Audio Autoplay Unlock Banner / Connection Warnings */}
          <div className="px-4 flex flex-col items-center gap-2">
            {audioPlaybackBlocked && activeStream.status === 'live' && (
              <button
                type="button"
                onClick={() => void handleUnlockAudio()}
                className="pointer-events-auto inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg"
              >
                <Volume2 className="w-4 h-4" />
                <span>Tap to Enable Live Audio</span>
              </button>
            )}
            {rtcState === 'reconnecting' && (
              <div className="px-3 py-1.5 rounded-lg bg-amber-500/90 text-slate-950 text-xs font-semibold">
                Reconnecting live audio/video...
              </div>
            )}
            {rtcError && (
              <div className="pointer-events-auto max-w-md px-3.5 py-2 rounded-xl bg-red-950/90 border border-red-500/50 text-xs text-red-100 text-center">
                {rtcError}
              </div>
            )}
          </div>
        </div>

        {/* Broadcaster Hardware Controls (Floating Right Edge above bottom chat) */}
        {isHost && activeStream.status === 'live' && (
          <div className="absolute right-3 sm:right-5 bottom-24 z-30 flex flex-col gap-2.5">
            <button
              type="button"
              disabled={switchingCamera}
              onClick={() => void handleSwitchLiveCamera()}
              aria-label="Switch front and rear camera"
              className="w-11 h-11 rounded-full bg-black/60 border border-white/20 hover:bg-black/80 flex items-center justify-center"
              title="Switch camera"
            >
              {switchingCamera ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <SwitchCamera className="w-5 h-5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => void handleToggleLiveMic()}
              aria-label={hostMicOn ? 'Mute microphone' : 'Unmute microphone'}
              className={`w-11 h-11 rounded-full border flex items-center justify-center ${
                hostMicOn
                  ? 'bg-black/60 border-white/20 text-white'
                  : 'bg-red-600 border-red-400 text-white'
              }`}
              title={hostMicOn ? 'Mic On' : 'Mic Muted'}
            >
              {hostMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
            </button>

            <button
              type="button"
              onClick={() => void handleToggleLiveCam()}
              aria-label={hostCamOn ? 'Turn camera off' : 'Turn camera on'}
              className={`w-11 h-11 rounded-full border flex items-center justify-center ${
                hostCamOn
                  ? 'bg-black/60 border-white/20 text-white'
                  : 'bg-red-600 border-red-400 text-white'
              }`}
              title={hostCamOn ? 'Camera On' : 'Camera Off'}
            >
              {hostCamOn ? <Camera className="w-5 h-5" /> : <CameraOff className="w-5 h-5" />}
            </button>
          </div>
        )}

        {/* Bottom-Anchored Live Messages, Reactions & Input Dock */}
        <div className="absolute bottom-0 inset-x-0 z-20 p-3 sm:p-4 pb-safe bg-gradient-to-t from-black/95 via-black/70 to-transparent space-y-2.5">
          {/* Stream Title & Floating Hearts */}
          <div className="flex items-center justify-between gap-2 pr-14">
            <p className="text-xs font-semibold text-blue-300 truncate">
              {activeStream.category} · {activeStream.title}
            </p>
            <div className="relative flex items-center gap-1">
              {floatingHearts.map((h) => (
                <Heart
                  key={h.id}
                  style={{ transform: `translateX(${h.offsetX}px)` }}
                  className="w-6 h-6 text-rose-500 fill-rose-500 animate-bounce pointer-events-none"
                />
              ))}
            </div>
          </div>

          {/* Live Messages Received (Anchored at Bottom of Screen, Stacked Vertically, Auto-Scrolling) */}
          <div
            ref={commentsListRef}
            aria-live="polite"
            aria-label="Live stream messages"
            className="max-h-[34dvh] min-h-[44px] overflow-y-auto flex flex-col gap-1.5 pr-16"
          >
            <div className="mt-auto flex flex-col items-start gap-1.5">
              {comments.length === 0 ? (
                <p className="text-xs text-slate-300/85 bg-black/45 backdrop-blur-xs rounded-xl px-3 py-1.5">
                  Welcome to {activeStream.hostDisplayName}&apos;s LIVE! Say hello below.
                </p>
              ) : (
                comments.slice(-50).map((c) => (
                  <div
                    key={c.id}
                    className={`w-fit max-w-full rounded-xl px-3 py-1.5 text-xs shadow-xs ${
                      c.kind === 'gift'
                        ? 'bg-amber-500/25 border border-amber-400/40 text-amber-100'
                        : 'bg-black/55 backdrop-blur-xs text-white'
                    }`}
                  >
                    <span className="font-bold text-blue-300 mr-1.5">{c.authorDisplayName}</span>
                    <span className="break-words">{c.content}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {commentError && (
            <p className="text-xs text-red-200 bg-red-950/80 border border-red-500/40 rounded-xl px-3 py-1.5">
              {commentError}
            </p>
          )}

          {/* Gift Reaction Bar */}
          {giftTrayOpen && (
            <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-2xl bg-slate-900/95 border border-slate-700">
              {LIVE_GIFTS.map((g) => (
                <button
                  key={g.label}
                  type="button"
                  onClick={() => void handleSendGift(g.text)}
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-blue-600 text-xs font-semibold transition-colors"
                >
                  {g.label}
                </button>
              ))}
            </div>
          )}

          {/* Comment Input & Quick Action Icons */}
          <div className="flex items-center gap-2">
            <form onSubmit={handleSendComment} className="flex-1 flex items-center gap-2">
              <input
                type="text"
                maxLength={400}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Say something live..."
                className="flex-1 h-11 px-4 rounded-full bg-white/15 border border-white/20 text-sm text-white placeholder:text-slate-300 focus:bg-black/60 focus:border-blue-400 focus:outline-none"
              />
              {commentText.trim() && (
                <button
                  type="submit"
                  aria-label="Send live comment"
                  className="w-11 h-11 rounded-full bg-blue-600 hover:bg-blue-500 flex items-center justify-center shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              )}
            </form>

            <button
              type="button"
              onClick={() => setGiftTrayOpen((v) => !v)}
              aria-label="Send reaction gift"
              className="w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center shrink-0"
            >
              <Gift className="w-5 h-5 text-amber-300" />
            </button>

            <button
              type="button"
              onClick={() => {
                const url = `${window.location.origin}/live?room=${activeStream.id}`;
                if (navigator.share) {
                  void navigator.share({ title: activeStream.title, url });
                } else {
                  void navigator.clipboard?.writeText(url);
                }
                setSharedCopied(true);
                window.setTimeout(() => setSharedCopied(false), 1800);
              }}
              aria-label="Share live stream"
              className="w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center shrink-0"
            >
              {sharedCopied ? (
                <Check className="w-5 h-5 text-emerald-400" />
              ) : (
                <Share2 className="w-5 h-5" />
              )}
            </button>

            <button
              type="button"
              onClick={handleSendLikeReaction}
              aria-label="Like live stream"
              className="w-11 h-11 rounded-full bg-rose-600 hover:bg-rose-500 flex items-center justify-center shrink-0 active:scale-90 transition-transform"
            >
              <Heart className="w-5 h-5 fill-white" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* LIVE Discovery Header */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0">
            <Radio className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">AINEMAX LIVE</h2>
            <p className="text-xs text-slate-500">
              Real-time camera &amp; audio broadcasts powered by LiveKit WebRTC
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={openSetupScreen}
          className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition-colors shadow-xs"
        >
          <Radio className="w-4 h-4" />
          <span>Go LIVE</span>
        </button>
      </section>

      {/* LiveKit Infrastructure Status */}
      {!livekitStatus.checked
        ? null
        : (!livekitStatus.configured || !livekitStatus.verified) && (
            <section className="rounded-2xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 p-4 flex items-start gap-3 text-xs text-amber-900 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1 leading-relaxed">
                <p className="font-semibold">
                  {!livekitStatus.configured
                    ? 'LiveKit WebRTC server credentials are not configured.'
                    : 'LiveKit WebRTC credentials failed validation.'}
                </p>
                <p>
                  {livekitStatus.error ||
                    'Verify LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET in environment secrets.'}
                </p>
              </div>
            </section>
          )}

      {/* Category Filter Row */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {LIVE_CATEGORIES.map((cat) => {
          const active = categoryFilter === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`px-3.5 py-2 min-h-[38px] rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                active
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Active Genuine Broadcasts */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">
            Live Now ({liveStreams.length})
          </h3>
        </div>

        {liveStreams.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-3">
            <Radio className="w-9 h-9 text-blue-600 mx-auto" />
            <h4 className="text-base font-bold text-slate-900">No creators are live right now</h4>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              Tap Go LIVE above to open your camera preview, test your microphone, and start the
              first live broadcast.
            </p>
            <button
              type="button"
              onClick={openSetupScreen}
              className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
            >
              <Camera className="w-4 h-4" />
              <span>Start LIVE Broadcast</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {liveStreams.map((st) => (
              <article
                key={st.id}
                className="group bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col hover:border-blue-300 transition-colors"
              >
                <div className="relative aspect-[4/3] bg-slate-950 overflow-hidden">
                  {st.coverUrl ? (
                    <img
                      src={st.coverUrl}
                      alt={st.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-blue-700 via-slate-900 to-slate-950 flex items-center justify-center">
                      <Radio className="w-10 h-10 text-white/40" />
                    </div>
                  )}

                  <div className="absolute top-3 left-3 flex items-center gap-1.5">
                    <span className="px-2 py-1 rounded-md bg-red-600 text-white text-[11px] font-bold">
                      LIVE
                    </span>
                    <span className="px-2 py-1 rounded-md bg-black/65 text-white text-[11px] font-semibold tabular-nums inline-flex items-center gap-1">
                      <Eye className="w-3 h-3" />
                      {st.viewerCount}
                    </span>
                  </div>

                  <div className="absolute bottom-3 left-3 px-2 py-0.5 rounded-md bg-black/65 text-white text-[11px] font-medium">
                    {st.category}
                  </div>
                </div>

                <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center overflow-hidden shrink-0">
                      {st.hostAvatarUrl ? (
                        <img
                          src={st.hostAvatarUrl}
                          alt={st.hostDisplayName}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        st.hostDisplayName.slice(0, 1).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-slate-900 line-clamp-1">{st.title}</h4>
                      <div className="flex items-center gap-1 text-xs text-slate-500">
                        <span className="truncate">{st.hostDisplayName}</span>
                        {st.hostVerified && <BadgeCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleJoinStream(st)}
                    className="w-full py-2.5 min-h-[42px] rounded-xl bg-blue-600 text-white text-xs sm:text-sm font-semibold hover:bg-blue-700"
                  >
                    Watch LIVE
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Ended Broadcast Replays */}
      {endedStreams.length > 0 && (
        <section className="space-y-3 pt-2">
          <h3 className="text-sm font-bold text-slate-700">Recent Ended Broadcasts</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {endedStreams.map((st) => (
              <article
                key={st.id}
                className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-semibold text-slate-500">Ended · {st.category}</span>
                    <span className="tabular-nums">{st.viewerCount} viewers</span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 mt-1.5 line-clamp-1">
                    {st.title}
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {st.hostDisplayName} (@{st.hostUsername})
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleJoinStream(st)}
                  className="w-full py-2 min-h-[40px] rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-slate-200"
                >
                  View Chat Replay
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Full-Screen Pre-LIVE Camera & Microphone Setup Screen */}
      {setupOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Go LIVE setup and camera preview"
          className="fixed inset-0 z-[70] w-screen h-[100dvh] bg-black text-white overflow-hidden select-none"
        >
          {/* Full-Screen Live Camera Background */}
          <video
            ref={previewVideoRef}
            autoPlay
            muted
            playsInline
            className={`absolute inset-0 w-full h-full object-cover ${
              facingMode === 'user' ? '-scale-x-100' : ''
            }`}
          />

          {(!cameraEnabled || previewLoading || previewError) && (
            <div className="absolute inset-0 z-10 bg-slate-950/90 p-5 flex flex-col items-center justify-center text-center text-white space-y-3">
              {previewLoading ? (
                <>
                  <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
                  <p className="text-xs text-slate-300">
                    Requesting camera and microphone permission...
                  </p>
                </>
              ) : previewError ? (
                <div className="space-y-3 text-left max-w-xs bg-slate-900/90 border border-slate-700 rounded-2xl p-4">
                  <div className="flex items-center gap-2 text-amber-400">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    <h4 className="text-sm font-bold">{previewError.title}</h4>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed">
                    {previewError.message}
                  </p>
                  <ol className="list-decimal pl-4 space-y-1 text-[11px] text-slate-300">
                    {previewError.androidSteps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                  <button
                    type="button"
                    onClick={() =>
                      void startPreviewHardware(facingMode, cameraEnabled, micEnabled)
                    }
                    className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Retry Camera &amp; Mic Preview</span>
                  </button>
                </div>
              ) : (
                <>
                  <CameraOff className="w-9 h-9 text-slate-400" />
                  <p className="text-xs text-slate-300">Camera preview paused</p>
                </>
              )}
            </div>
          )}

          {/* Top Bar: Camera Label & Close */}
          <div className="absolute top-0 inset-x-0 z-20 p-4 bg-gradient-to-b from-black/80 via-black/35 to-transparent flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold bg-black/55 backdrop-blur-md border border-white/15 px-3 py-1.5 rounded-full">
                {facingMode === 'user' ? 'Front Camera' : 'Rear Camera'}
              </span>
              <span className="hidden sm:inline text-xs text-slate-200">
                Verify your camera &amp; mic before going live
              </span>
            </div>
            <button
              type="button"
              onClick={closeSetupScreen}
              aria-label="Close Go Live setup"
              className="w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Right-side Floating Hardware Controls */}
          <div className="absolute right-3 sm:right-5 top-20 z-20 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={handleSwitchSetupCamera}
              aria-label="Flip camera"
              title="Flip camera"
              className="w-11 h-11 rounded-full bg-black/60 border border-white/20 hover:bg-black/80 flex items-center justify-center"
            >
              <SwitchCamera className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={handleToggleSetupCamera}
              aria-label={cameraEnabled ? 'Turn camera off' : 'Turn camera on'}
              title={cameraEnabled ? 'Cam On' : 'Cam Off'}
              className={`w-11 h-11 rounded-full border flex items-center justify-center ${
                cameraEnabled ? 'bg-black/60 border-white/20' : 'bg-red-600 border-red-400'
              }`}
            >
              {cameraEnabled ? <Camera className="w-5 h-5" /> : <CameraOff className="w-5 h-5" />}
            </button>
            <button
              type="button"
              onClick={handleToggleSetupMic}
              aria-label={micEnabled ? 'Mute microphone' : 'Unmute microphone'}
              title={micEnabled ? 'Mic On' : 'Muted'}
              className={`w-11 h-11 rounded-full border flex items-center justify-center ${
                micEnabled ? 'bg-black/60 border-white/20' : 'bg-red-600 border-red-400'
              }`}
            >
              {micEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
            </button>
          </div>

          {/* Bottom Overlay Setup Form */}
          <form
            onSubmit={handleLaunchBroadcast}
            className="absolute bottom-0 inset-x-0 z-20 p-4 sm:p-6 pb-safe bg-gradient-to-t from-black/95 via-black/80 to-transparent"
          >
            <div className="max-w-xl mx-auto space-y-3">
              {/* Live Mic Level Meter */}
              <div className="flex items-center gap-2 text-xs">
                {micEnabled ? (
                  <Mic className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <MicOff className="w-4 h-4 text-red-400 shrink-0" />
                )}
                <div className="flex-1 h-1.5 rounded-full bg-white/20 overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 transition-all duration-75"
                    style={{ width: `${micEnabled ? Math.max(4, micLevel) : 0}%` }}
                  />
                </div>
                <span className="text-[11px] text-slate-300">
                  {micEnabled ? 'Mic live' : 'Muted'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  id="live-title"
                  type="text"
                  required
                  minLength={2}
                  maxLength={120}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter your LIVE title..."
                  aria-label="LIVE Title"
                  className="sm:col-span-2 w-full h-11 px-4 rounded-xl bg-white/15 border border-white/20 text-sm text-white placeholder:text-slate-300 focus:bg-black/60 focus:border-blue-400 focus:outline-none"
                />

                <select
                  id="live-cat"
                  aria-label="Category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-slate-900/90 border border-white/20 text-xs font-medium text-white"
                >
                  <option value="Community">Community Q&amp;A</option>
                  <option value="Music">Music &amp; Sessions</option>
                  <option value="Tech">Tech &amp; Creators</option>
                  <option value="Gaming">Gaming</option>
                  <option value="News">World &amp; News</option>
                </select>

                <select
                  id="live-aud"
                  aria-label="Audience"
                  value={visibility}
                  onChange={(e) =>
                    setVisibility(e.target.value === 'followers' ? 'followers' : 'public')
                  }
                  className="w-full h-10 px-3 rounded-xl bg-slate-900/90 border border-white/20 text-xs font-medium text-white"
                >
                  <option value="public">Everyone</option>
                  <option value="followers">Followers Only</option>
                </select>
              </div>

              <div className="flex items-center gap-2.5">
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleCoverChosen}
                />
                {coverPreviewUrl ? (
                  <div className="flex items-center gap-2 bg-white/15 border border-white/20 rounded-xl px-2.5 py-1.5">
                    <img
                      src={coverPreviewUrl}
                      alt="Live cover preview"
                      className="w-8 h-8 rounded-lg object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
                        setCoverPreviewUrl(null);
                        setCoverFile(null);
                      }}
                      className="text-xs text-slate-200 hover:text-white"
                    >
                      Remove cover
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => coverInputRef.current?.click()}
                    className="h-12 px-3.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 text-xs font-medium text-white inline-flex items-center gap-2 shrink-0"
                  >
                    <ImagePlus className="w-4 h-4 text-blue-300" />
                    <span className="hidden sm:inline">Cover Photo</span>
                  </button>
                )}

                <button
                  type="submit"
                  disabled={starting || !title.trim()}
                  className="flex-1 h-12 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-500 disabled:opacity-50 inline-flex items-center justify-center gap-2"
                >
                  {starting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Radio className="w-4 h-4" />
                  )}
                  <span>{starting ? 'Starting Broadcast...' : 'Start LIVE Now'}</span>
                </button>
              </div>

              {launchError && (
                <p className="text-xs text-red-200 bg-red-950/85 border border-red-500/40 rounded-xl px-3 py-2">
                  {launchError}
                </p>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
