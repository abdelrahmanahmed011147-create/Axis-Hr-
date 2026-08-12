import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// @ts-ignore
const firestoreDatabaseId: string | undefined =
  firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
    ? firebaseConfig.firestoreDatabaseId
    : undefined;

// CRITICAL FIX (part 1/2 of the active->pending bug):
//
// Firebase Auth was already using browserLocalPersistence, so the *auth*
// session survives browser/computer restarts. Firestore, however, was left
// on its default in-memory cache, which is wiped clean on every single page
// load. That mismatch is what made "browser restart / computer restart /
// power outage / returning after days" scenarios dangerous: onAuthStateChanged
// could restore the user almost instantly (from IndexedDB), but the very
// first Firestore profile read then had an EMPTY local cache and depended
// entirely on the network already being up at that exact instant. If it
// wasn't, the profile listener had nothing to show, which (before this fix)
// AuthContext misread as "this employee doesn't exist yet".
//
// Switching to a persistent (IndexedDB-backed) Firestore cache means the
// last known employee document — status, name, salary, department, etc. —
// is available immediately and offline, on every app load, not just while
// the tab that fetched it stays open. persistentMultipleTabManager also
// lets multiple open tabs share one cache instead of fighting over it
// (relevant to the "two tabs login simultaneously" case).
function createDb() {
  try {
    return initializeFirestore(
      app,
      {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      },
      firestoreDatabaseId
    );
  } catch (err) {
    // initializeFirestore throws if a Firestore instance for this app was
    // already created (e.g. Vite HMR re-running this module). Fall back to
    // the existing instance instead of crashing the app.
    console.warn('[Firebase] initializeFirestore failed, falling back to getFirestore:', err);
    return firestoreDatabaseId ? getFirestore(app, firestoreDatabaseId) : getFirestore(app);
  }
}

export const db = createDb();
export const auth = getAuth(app);

export const initializeAuthPersistence = async () => {
  try {
    // Explicitly force local (IndexedDB-backed) persistence and WAIT for it to complete.
    // This is the critical fix. It ensures that the session survives browser/system restarts.
    await setPersistence(auth, browserLocalPersistence);
  } catch (err) {
    console.error('Failed to set auth persistence:', err);
  }
};

export const getGoogleProvider = () => {
  try {
    return new GoogleAuthProvider();
  } catch (e) {
    console.error("Failed to construct GoogleAuthProvider", e);
    throw e;
  }
};

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
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const currentAuth = auth.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentAuth?.uid || null,
      email: currentAuth?.email || null,
      emailVerified: currentAuth?.emailVerified || null,
      isAnonymous: currentAuth?.isAnonymous || null,
    },
    operationType,
    path
    
  }
  const errorMessage = JSON.stringify(errInfo);
  console.error('Firestore Error: ', errorMessage);
  
  const err = new Error(errorMessage);
  throw err;
}