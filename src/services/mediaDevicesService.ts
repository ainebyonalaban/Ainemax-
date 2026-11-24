export type CameraFacingMode = 'user' | 'environment';

export type MediaDeviceErrorCode =
  | 'insecure_context'
  | 'unsupported'
  | 'permission_denied'
  | 'not_found'
  | 'in_use'
  | 'overconstrained'
  | 'unknown';

export interface MediaDeviceDiagnostic {
  code: MediaDeviceErrorCode;
  title: string;
  message: string;
  androidSteps: string[];
}

export interface MediaPermissionSnapshot {
  camera: PermissionState | 'unknown';
  microphone: PermissionState | 'unknown';
  hasCameraDevice: boolean;
  hasMicDevice: boolean;
  videoInputsCount: number;
  isSecureContext: boolean;
}

export function stopMediaStream(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  stream.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch {
      // Ignore track stop failures on already-ended tracks
    }
  });
}

export async function inspectMediaEnvironment(): Promise<MediaPermissionSnapshot> {
  const isSecureContext =
    typeof window !== 'undefined' &&
    (window.isSecureContext ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1');

  let camera: PermissionState | 'unknown' = 'unknown';
  let microphone: PermissionState | 'unknown' = 'unknown';

  if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
    try {
      const camStatus = await navigator.permissions.query({
        name: 'camera' as PermissionName,
      });
      camera = camStatus.state;
    } catch {
      camera = 'unknown';
    }
    try {
      const micStatus = await navigator.permissions.query({
        name: 'microphone' as PermissionName,
      });
      microphone = micStatus.state;
    } catch {
      microphone = 'unknown';
    }
  }

  let hasCameraDevice = false;
  let hasMicDevice = false;
  let videoInputsCount = 0;

  if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === 'videoinput');
      const audioInputs = devices.filter((d) => d.kind === 'audioinput');
      videoInputsCount = videoInputs.length;
      hasCameraDevice = videoInputs.length > 0;
      hasMicDevice = audioInputs.length > 0;
    } catch {
      // Enumeration failed before permission grant
    }
  }

  return {
    camera,
    microphone,
    hasCameraDevice,
    hasMicDevice,
    videoInputsCount,
    isSecureContext,
  };
}

export function formatMediaDeviceError(err: unknown): MediaDeviceDiagnostic {
  const domName =
    typeof err === 'object' && err !== null && 'name' in err
      ? String((err as { name: unknown }).name)
      : '';
  const rawMessage = err instanceof Error ? err.message : String(err || '');

  if (
    typeof window !== 'undefined' &&
    !window.isSecureContext &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1'
  ) {
    return {
      code: 'insecure_context',
      title: 'HTTPS connection required',
      message:
        'Mobile and desktop browsers block camera and microphone access on insecure HTTP origins. Open AINEMAX over HTTPS.',
      androidSteps: [
        'Ensure the address bar shows https:// with a lock icon.',
        'Reload the page over HTTPS before tapping Go Live.',
      ],
    };
  }

  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return {
      code: 'unsupported',
      title: 'Camera API unavailable in this browser',
      message:
        'This browser or embedded WebView does not expose navigator.mediaDevices.getUserMedia().',
      androidSteps: [
        'Open AINEMAX directly in Google Chrome on Android instead of an in-app browser.',
        'Update Chrome from Google Play Store and reload.',
      ],
    };
  }

  if (domName === 'NotAllowedError' || domName === 'PermissionDeniedError' || domName === 'SecurityError') {
    return {
      code: 'permission_denied',
      title: 'Camera or microphone permission blocked',
      message:
        'AINEMAX needs explicit permission to access your camera and microphone before broadcasting.',
      androidSteps: [
        'In Android Chrome, tap the lock / tune icon to the left of the address bar.',
        'Tap Permissions, then switch both Camera and Microphone to Allow.',
        'If still blocked: open Chrome Menu (⋮) → Settings → Site settings → Camera & Microphone, remove this site from Blocked, and tap Retry Preview.',
        'Also confirm Android System Settings → Apps → Chrome → Permissions allows Camera & Microphone.',
      ],
    };
  }

  if (domName === 'NotFoundError' || domName === 'DevicesNotFoundError') {
    return {
      code: 'not_found',
      title: 'No camera or microphone detected',
      message:
        'Your device reported no available camera or microphone hardware for this request.',
      androidSteps: [
        'Verify your device has a working front or rear camera and microphone.',
        'Close external USB camera adapters or reconnect your headset and tap Retry Preview.',
      ],
    };
  }

  if (domName === 'NotReadableError' || domName === 'TrackStartError' || domName === 'AbortError') {
    return {
      code: 'in_use',
      title: 'Camera or microphone is already in use',
      message:
        'Another app or browser tab (such as WhatsApp, Instagram, Recorder, or a video call) is currently holding your camera hardware.',
      androidSteps: [
        'Close other camera apps, screen recorders, or background video calls.',
        'Lock/unlock your screen once or switch Chrome tabs and tap Retry Preview.',
      ],
    };
  }

  if (domName === 'OverconstrainedError' || domName === 'ConstraintNotSatisfiedError') {
    return {
      code: 'overconstrained',
      title: 'Selected camera lens unavailable',
      message:
        'Your device could not open the requested camera lens at this resolution.',
      androidSteps: [
        'Tap Switch Camera to try the other camera lens (front or rear).',
      ],
    };
  }

  return {
    code: 'unknown',
    title: 'Unable to start camera preview',
    message: rawMessage || 'Unexpected hardware error while accessing camera and microphone.',
    androidSteps: [
      'Confirm Camera & Microphone are allowed in your browser permissions.',
      'Close other apps using the camera and tap Retry Preview.',
    ],
  };
}

export async function requestCameraAndMicStream(options: {
  facingMode: CameraFacingMode;
  audio: boolean;
  video: boolean;
  existingStream?: MediaStream | null;
}): Promise<MediaStream> {
  if (
    typeof window !== 'undefined' &&
    !window.isSecureContext &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1'
  ) {
    throw Object.assign(new Error('HTTPS is required to access camera and microphone.'), {
      name: 'SecurityError',
    });
  }

  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw Object.assign(new Error('Camera API unavailable in this browser.'), {
      name: 'NotSupportedError',
    });
  }

  // Critical on Android Chrome: stop active hardware tracks BEFORE requesting a different facingMode lens
  if (options.existingStream) {
    stopMediaStream(options.existingStream);
  }

  const videoConstraint: MediaTrackConstraints | boolean = options.video
    ? {
        facingMode: { ideal: options.facingMode },
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
        frameRate: { ideal: 30, max: 30 },
      }
    : false;

  const audioConstraint: MediaTrackConstraints | boolean = options.audio
    ? {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      }
    : false;

  try {
    return await navigator.mediaDevices.getUserMedia({
      video: videoConstraint,
      audio: audioConstraint,
    });
  } catch (err) {
    const domName =
      typeof err === 'object' && err !== null && 'name' in err
        ? String((err as { name: unknown }).name)
        : '';

    // Retry once with relaxed constraints if ideal resolution/lens failed
    if (domName === 'OverconstrainedError' && options.video) {
      return navigator.mediaDevices.getUserMedia({
        video: { facingMode: options.facingMode },
        audio: options.audio,
      });
    }

    throw err;
  }
}

export function attachStreamAudioLevel(
  stream: MediaStream | null,
  onLevel: (level0to100: number) => void
): () => void {
  if (!stream || stream.getAudioTracks().length === 0 || typeof window === 'undefined') {
    onLevel(0);
    return () => undefined;
  }

  const AudioCtx =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) {
    return () => undefined;
  }

  let ctx: AudioContext | null = null;
  let rafId = 0;
  let cancelled = false;

  try {
    ctx = new AudioCtx();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      if (cancelled) return;
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) {
        sum += data[i];
      }
      const avg = data.length > 0 ? sum / data.length : 0;
      onLevel(Math.min(100, Math.round((avg / 128) * 100)));
      rafId = window.requestAnimationFrame(tick);
    };

    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    rafId = window.requestAnimationFrame(tick);
  } catch {
    onLevel(0);
  }

  return () => {
    cancelled = true;
    if (rafId) window.cancelAnimationFrame(rafId);
    if (ctx) {
      void ctx.close().catch(() => undefined);
    }
  };
}
