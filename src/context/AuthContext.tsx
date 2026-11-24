import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  ConfirmationResult,
  GoogleAuthProvider,
  RecaptchaVerifier,
  User,
  confirmPasswordReset,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { OperationType, auth, db, handleFirestoreError } from '../lib/firebase';
import {
  AccountType,
  PROFILE_CONSTRAINTS,
  ProfileVisibility,
  UserPrivateInfo,
  UserPublicProfile,
} from '../types/user';

export interface OnboardingInput {
  username: string;
  displayName: string;
  bio: string;
  accountType: AccountType;
  language: string;
}

export interface ProfileUpdateInput {
  displayName: string;
  bio: string;
  accountType: AccountType;
  avatarUrl?: string;
  coverUrl?: string;
}

export interface PrivacyUpdateInput {
  language: string;
  profileVisibility: ProfileVisibility;
}

interface AuthContextValue {
  firebaseUser: User | null;
  authReady: boolean;
  isVerifiedIdentity: boolean;
  profile: UserPublicProfile | null;
  privateInfo: UserPrivateInfo | null;
  profileLoading: boolean;
  isAdmin: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  sendPhoneOtp: (phoneNumber: string, containerId: string) => Promise<ConfirmationResult>;
  confirmPhoneOtp: (confirmation: ConfirmationResult, code: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  confirmResetCode: (oobCode: string, newPassword: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  refreshAuthUser: () => Promise<boolean>;
  checkUsernameAvailable: (username: string) => Promise<boolean>;
  completeOnboardingProfile: (input: OnboardingInput) => Promise<void>;
  updatePublicProfile: (input: ProfileUpdateInput) => Promise<void>;
  updateAccountPrivacy: (input: PrivacyUpdateInput) => Promise<void>;
  saveFcmToken: (token: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function formatFirebaseAuthError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Invalid email or password. Please check your credentials and try again.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try signing in instead.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters long.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/operation-not-allowed':
      return 'This sign-in provider is not yet enabled in your Firebase Console (Authentication -> Sign-in method). Please enable it in Firebase Console or use Google Sign-In.';
    case 'auth/popup-closed-by-user':
      return 'Sign-in popup was closed before completing.';
    case 'auth/popup-blocked':
      return 'Popup was blocked by your browser. Please allow popups for this site and try again.';
    case 'auth/unauthorized-domain':
      return 'This domain is not authorized in Firebase Console -> Authentication -> Settings -> Authorized domains.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment before trying again.';
    case 'auth/invalid-phone-number':
      return 'Please enter a valid phone number in international E.164 format (e.g., +15551234567).';
    case 'auth/invalid-verification-code':
      return 'The 6-digit verification code is incorrect. Please check and try again.';
    case 'auth/code-expired':
      return 'The verification code has expired. Request a new code.';
    case 'auth/captcha-check-failed':
      return 'reCAPTCHA verification failed. Please reload and try again.';
    case 'auth/expired-action-code':
    case 'auth/invalid-action-code':
      return 'This password reset link is invalid or has expired. Request a new one.';
    default:
      return error instanceof Error ? error.message : 'Authentication failed. Please try again.';
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [userTick, setUserTick] = useState(0);
  const [profile, setProfile] = useState<UserPublicProfile | null>(null);
  const [privateInfo, setPrivateInfo] = useState<UserPrivateInfo | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const isPhoneProvider =
    firebaseUser?.providerData.some((p) => p.providerId === 'phone') ?? false;
  const isVerifiedIdentity = Boolean(
    firebaseUser && (firebaseUser.emailVerified || isPhoneProvider)
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      if (!user) {
        setProfile(null);
        setPrivateInfo(null);
        setIsAdmin(false);
        setProfileLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Attach Firestore listeners only when auth is ready and identity is verified
  useEffect(() => {
    if (!authReady || !firebaseUser) {
      return;
    }

    if (!isVerifiedIdentity) {
      setProfile(null);
      setPrivateInfo(null);
      setIsAdmin(false);
      setProfileLoading(false);
      return;
    }

    setProfileLoading(true);
    const uid = firebaseUser.uid;
    const publicPath = `users/${uid}`;
    const privatePath = `users/${uid}/private/info`;

    let publicResolved = false;
    let privateResolved = false;
    const markResolved = () => {
      if (publicResolved && privateResolved) {
        setProfileLoading(false);
      }
    };

    const unsubPublic = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        setProfile(snap.exists() ? (snap.data() as UserPublicProfile) : null);
        publicResolved = true;
        markResolved();
      },
      (error) => {
        setProfileLoading(false);
        handleFirestoreError(error, OperationType.GET, publicPath);
      }
    );

    const unsubPrivate = onSnapshot(
      doc(db, 'users', uid, 'private', 'info'),
      (snap) => {
        setPrivateInfo(snap.exists() ? (snap.data() as UserPrivateInfo) : null);
        privateResolved = true;
        markResolved();
      },
      (error) => {
        setProfileLoading(false);
        handleFirestoreError(error, OperationType.GET, privatePath);
      }
    );

    // Check admin authorization against bootstrapped email or /admins/{uid}
    const checkAdmin = async () => {
      if (
        firebaseUser.emailVerified &&
        firebaseUser.email === 'ainebyonalaban2@gmail.com'
      ) {
        setIsAdmin(true);
        return;
      }
      try {
        const adminSnap = await getDoc(doc(db, 'admins', uid));
        setIsAdmin(adminSnap.exists());
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `admins/${uid}`);
      }
    };
    void checkAdmin();

    return () => {
      unsubPublic();
      unsubPrivate();
    };
  }, [authReady, firebaseUser, isVerifiedIdentity, userTick]);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  }, []);

  const registerWithEmail = useCallback(async (email: string, password: string) => {
    const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
    await sendEmailVerification(credential.user);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await signInWithPopup(auth, provider);
  }, []);

  const sendPhoneOtp = useCallback(async (phoneNumber: string, containerId: string) => {
    const verifier = new RecaptchaVerifier(auth, containerId, {
      size: 'invisible',
    });
    try {
      return await signInWithPhoneNumber(auth, phoneNumber.trim(), verifier);
    } catch (error) {
      verifier.clear();
      throw error;
    }
  }, []);

  const confirmPhoneOtp = useCallback(async (confirmation: ConfirmationResult, code: string) => {
    await confirmation.confirm(code.trim());
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim());
  }, []);

  const confirmResetCode = useCallback(async (oobCode: string, newPassword: string) => {
    await confirmPasswordReset(auth, oobCode, newPassword);
  }, []);

  const resendVerificationEmail = useCallback(async () => {
    if (!auth.currentUser) {
      throw new Error('No signed-in user found.');
    }
    await sendEmailVerification(auth.currentUser);
  }, []);

  const refreshAuthUser = useCallback(async () => {
    if (!auth.currentUser) return false;
    await auth.currentUser.reload();
    setFirebaseUser(auth.currentUser);
    setUserTick((t) => t + 1);
    const phoneVerified = auth.currentUser.providerData.some((p) => p.providerId === 'phone');
    return Boolean(auth.currentUser.emailVerified || phoneVerified);
  }, []);

  const checkUsernameAvailable = useCallback(async (rawUsername: string) => {
    const normalized = rawUsername.trim().toLowerCase();
    if (
      normalized.length < PROFILE_CONSTRAINTS.USERNAME_MIN ||
      normalized.length > PROFILE_CONSTRAINTS.USERNAME_MAX ||
      !PROFILE_CONSTRAINTS.USERNAME_REGEX.test(normalized)
    ) {
      return false;
    }
    const path = `usernames/${normalized}`;
    try {
      const snap = await getDoc(doc(db, 'usernames', normalized));
      return !snap.exists();
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }
  }, []);

  const completeOnboardingProfile = useCallback(async (input: OnboardingInput) => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('You must be signed in to complete onboarding.');
    }

    const uid = currentUser.uid;
    const normalizedUsername = input.username.trim().toLowerCase();
    const displayName = input.displayName.trim().slice(0, PROFILE_CONSTRAINTS.DISPLAY_NAME_MAX);
    const bio = input.bio.trim().slice(0, PROFILE_CONSTRAINTS.BIO_MAX);
    const language = input.language.trim().slice(0, PROFILE_CONSTRAINTS.LANGUAGE_MAX) || 'English (Global)';
    const accountType: AccountType =
      input.accountType === 'creator' || input.accountType === 'business'
        ? input.accountType
        : 'personal';

    if (
      normalizedUsername.length < PROFILE_CONSTRAINTS.USERNAME_MIN ||
      normalizedUsername.length > PROFILE_CONSTRAINTS.USERNAME_MAX ||
      !PROFILE_CONSTRAINTS.USERNAME_REGEX.test(normalizedUsername)
    ) {
      throw new Error(
        'Username must be 3–30 lowercase letters, numbers, or underscores.'
      );
    }

    if (displayName.length < PROFILE_CONSTRAINTS.DISPLAY_NAME_MIN) {
      throw new Error('Display name is required.');
    }

    const available = await checkUsernameAvailable(normalizedUsername);
    if (!available) {
      throw new Error('That username is already taken. Please choose another.');
    }

    const avatarUrl = (currentUser.photoURL ?? '').slice(0, PROFILE_CONSTRAINTS.URL_MAX);
    const email = (currentUser.email ?? '').slice(0, PROFILE_CONSTRAINTS.EMAIL_MAX);
    const phoneNumber = (currentUser.phoneNumber ?? '').slice(0, PROFILE_CONSTRAINTS.PHONE_MAX);

    const batch = writeBatch(db);
    batch.set(doc(db, 'usernames', normalizedUsername), {
      uid,
      username: normalizedUsername,
      createdAt: serverTimestamp(),
    });

    batch.set(doc(db, 'users', uid), {
      uid,
      username: normalizedUsername,
      displayName,
      bio,
      avatarUrl,
      coverUrl: '',
      accountType,
      isVerified: false,
      accountStatus: 'active',
      followersCount: 0,
      followingCount: 0,
      postsCount: 0,
      videosCount: 0,
      onboardingComplete: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(db, 'users', uid, 'private', 'info'), {
      uid,
      email,
      phoneNumber,
      language,
      profileVisibility: 'public',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
    }
  }, [checkUsernameAvailable]);

  const updatePublicProfile = useCallback(async (input: ProfileUpdateInput) => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('Sign in required.');
    }
    const uid = currentUser.uid;
    const displayName = input.displayName.trim().slice(0, PROFILE_CONSTRAINTS.DISPLAY_NAME_MAX);
    const bio = input.bio.trim().slice(0, PROFILE_CONSTRAINTS.BIO_MAX);
    if (displayName.length < PROFILE_CONSTRAINTS.DISPLAY_NAME_MIN) {
      throw new Error('Display name cannot be empty.');
    }

    const payload: Record<string, unknown> = {
      displayName,
      bio,
      accountType: input.accountType,
      updatedAt: serverTimestamp(),
    };
    if (typeof input.avatarUrl === 'string') {
      payload.avatarUrl = input.avatarUrl.slice(0, PROFILE_CONSTRAINTS.URL_MAX);
    }
    if (typeof input.coverUrl === 'string') {
      payload.coverUrl = input.coverUrl.slice(0, PROFILE_CONSTRAINTS.URL_MAX);
    }

    try {
      await updateDoc(doc(db, 'users', uid), payload);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
    }
  }, []);

  const updateAccountPrivacy = useCallback(async (input: PrivacyUpdateInput) => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('Sign in required.');
    }
    const uid = currentUser.uid;
    const language = input.language.trim().slice(0, PROFILE_CONSTRAINTS.LANGUAGE_MAX) || 'English (Global)';
    const path = `users/${uid}/private/info`;

    try {
      await updateDoc(doc(db, 'users', uid, 'private', 'info'), {
        language,
        profileVisibility: input.profileVisibility,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }, []);

  const saveFcmToken = useCallback(async (token: string) => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    const uid = currentUser.uid;
    const path = `users/${uid}/private/info`;
    try {
      await updateDoc(doc(db, 'users', uid, 'private', 'info'), {
        fcmToken: token.slice(0, 500),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        authReady,
        isVerifiedIdentity,
        profile,
        privateInfo,
        profileLoading,
        isAdmin,
        signInWithEmail,
        registerWithEmail,
        signInWithGoogle,
        sendPhoneOtp,
        confirmPhoneOtp,
        sendPasswordReset,
        confirmResetCode,
        resendVerificationEmail,
        refreshAuthUser,
        checkUsernameAvailable,
        completeOnboardingProfile,
        updatePublicProfile,
        updateAccountPrivacy,
        saveFcmToken,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
