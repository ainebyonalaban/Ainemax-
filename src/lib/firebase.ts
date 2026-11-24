import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
} from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
} from 'firebase/firestore';
import { Messaging, getMessaging, isSupported } from 'firebase/messaging';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const storage = getStorage(app);
storage.maxUploadRetryTime = 120000;
storage.maxOperationRetryTime = 30000;

let cachedMessaging: Messaging | null = null;
export async function getMessagingIfSupported(): Promise<Messaging | null> {
  if (cachedMessaging) return cachedMessaging;
  try {
    const supported = await isSupported();
    if (!supported) return null;
    cachedMessaging = getMessaging(app);
    return cachedMessaging;
  } catch {
    return null;
  }
}

// Persist authenticated user sessions across browser reloads
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error('Failed to configure auth persistence:', err);
});

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();
