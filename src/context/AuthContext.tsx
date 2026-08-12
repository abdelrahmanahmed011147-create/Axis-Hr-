/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  doc,
  onSnapshot,
  serverTimestamp,
  query,
  where,
  getDocsFromServer,
  collection,
  writeBatch,
  runTransaction,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Employee } from '../types';

interface AuthContextType {
  user: User | null;
  profile: Employee | null;
  loading: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
});

// Safety watchdog: loading must never stay true longer than this, no matter
// what path (or non-path) the auth/profile resolution logic takes. Raised
// from 5s to give a genuine server round-trip (used to disambiguate a cache
// miss from a real "no profile") room to complete on a slow reconnect.
const LOADING_TIMEOUT_MS = 8000;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  // Guards against resolving the same uid's "missing profile" case twice at
  // once (e.g. the onSnapshot listener firing again while a previous
  // resolution attempt is still in flight).
  const resolvingUidRef = useRef<string | null>(null);
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    // Arm/refresh the watchdog. Any code path that intends to keep loading
    // true must call this; any path that resolves loading must call
    // stopLoading() below, which disarms it.
    const startLoading = (reason: string) => {
      console.log('[Auth] loading -> true', reason);
      setLoading(true);
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = setTimeout(() => {
        console.warn('[Auth] loading watchdog fired — forcing loading -> false', reason);
        setLoading(false);
      }, LOADING_TIMEOUT_MS);
    };

    const stopLoading = (reason: string) => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
      console.log('[Auth] loading -> false', reason);
      setLoading(false);
    };

    /**
     * Runs ONLY when the profile listener has delivered a SERVER-CONFIRMED
     * "document does not exist" result (docSnap.metadata.fromCache === false).
     * A cache-sourced "doesn't exist" is never enough to get here — see the
     * onSnapshot callback below. This is the single place in the app allowed
     * to create a brand-new employee document, and every write in it is
     * additionally guarded by a Firestore transaction, whose read is always
     * served fresh from the server (transactions never read from the local
     * cache). That means:
     *
     *  - a document that was created moments ago by another tab, another
     *    device, or a previous run of this same function is never clobbered
     *    (covers concurrent-tab logins, and prevents this function from
     *    racing itself).
     *  - a document that genuinely exists on the server can never be
     *    overwritten with a fresh "pending" default — which was the actual
     *    mechanism behind "active -> pending".
     */
    const resolveMissingProfile = async (authUser: User) => {
      if (resolvingUidRef.current === authUser.uid) return; // already in flight
      resolvingUidRef.current = authUser.uid;

      const emailLower = authUser.email?.toLowerCase() || '';
      const isMaster = emailLower === 'abdelrahmanahmed011147@gmail.com'.toLowerCase();

      try {
        // Self-healing & migration: check whether an employee document
        // already exists under a DIFFERENT (old/legacy) uid with the same
        // email — e.g. one created manually by HR before this Firebase Auth
        // uid existed. This lookup MUST hit the server, not the cache: a
        // stale/empty cache here must never be read as "no legacy record".
        let legacyDoc: { id: string; data: any } | null = null;
        try {
          const q = query(collection(db, 'employees'), where('email', '==', emailLower));
          const qSnap = await getDocsFromServer(q);
          if (!qSnap.empty) {
            const found = qSnap.docs.find(d => !d.data().migrated) || qSnap.docs[0];
            legacyDoc = { id: found.id, data: found.data() };
          }
        } catch (lookupErr) {
          // Offline or server unreachable — we cannot safely determine
          // whether a legacy record exists. Do NOT fall through to creating
          // a brand-new "pending" profile in this case. Bail out; the next
          // auth/profile event (once connectivity returns) will retry.
          console.warn('[Auth] legacy-profile lookup failed, deferring resolution:', lookupErr);
          return;
        }

        let didCreate = false;
        let didMigrate = false;
        const oldUid = legacyDoc?.id;

        await runTransaction(db, async (tx) => {
          const newRef = doc(db, 'employees', authUser.uid);
          // Authoritative existence check — transaction reads always go to
          // the server. If a doc now exists here (created since our
          // onSnapshot fired), back off and change nothing.
          const freshSnap = await tx.get(newRef);
          if (freshSnap.exists()) {
            return;
          }

          if (legacyDoc && legacyDoc.id !== authUser.uid && !legacyDoc.data.migrated) {
            const migratedData = {
              ...legacyDoc.data,
              email: emailLower,
              fullName: legacyDoc.data.fullName || authUser.displayName || 'موظف جديد',
              updatedAt: serverTimestamp(),
            };
            // 1) Create the new profile, carrying over all old data.
            tx.set(newRef, migratedData);
            // 2) NEVER delete the old profile. Mark it as migrated instead,
            //    so it stays in Firestore permanently as a recoverable
            //    backup. Pure additive write (merge: true) — cannot destroy
            //    data, only annotate it.
            tx.set(
              doc(db, 'employees', legacyDoc.id),
              { migrated: true, migratedTo: authUser.uid, migratedAt: serverTimestamp() },
              { merge: true }
            );
            didMigrate = true;
          } else {
            const employeeData = {
              roleCode: isMaster ? 'MASTER_ADMIN' : '',
              fullName: authUser.displayName || 'موظف جديد',
              role: isMaster ? 'GM-MASTER' : 'EMPLOYEE',
              company: isMaster ? 'مجموعة أكسس' : '',
              department: isMaster ? 'General' : '',
              jobTitle: isMaster ? 'General Manager' : '',
              phone: authUser.phoneNumber || '',
              email: emailLower,
              status: isMaster ? 'active' : 'pending',
              createdAt: serverTimestamp(),
            };
            tx.set(newRef, employeeData);
            didCreate = true;
          }
        });

        if (didMigrate && oldUid) {
          console.log(`[Auth] Successfully migrated profile from ${oldUid} to ${authUser.uid} (old doc preserved as backup)`);
          // Migrate cross-references (requests/attendance/evaluations) from
          // the legacy uid to the new uid. Best-effort follow-up — it never
          // touches the employee document itself, so even if it fails
          // partway through, the profile committed above is unaffected.
          try {
            const batch = writeBatch(db);
            let hasBatchOperations = false;

            const reqsSnap = await getDocsFromServer(query(collection(db, 'requests'), where('userId', '==', oldUid)));
            reqsSnap.forEach(d => { batch.update(d.ref, { userId: authUser.uid }); hasBatchOperations = true; });

            const attSnap = await getDocsFromServer(query(collection(db, 'attendance'), where('userId', '==', oldUid)));
            attSnap.forEach(d => { batch.update(d.ref, { userId: authUser.uid }); hasBatchOperations = true; });

            const evSnap = await getDocsFromServer(query(collection(db, 'kpiEvaluations'), where('employeeId', '==', oldUid)));
            evSnap.forEach(d => { batch.update(d.ref, { employeeId: authUser.uid }); hasBatchOperations = true; });

            if (hasBatchOperations) await batch.commit();
          } catch (refErr) {
            console.warn('[Auth] cross-reference migration follow-up failed (non-fatal):', refErr);
          }
        } else if (didCreate) {
          console.log('[Auth] created new pending profile for', authUser.uid);
        } else {
          console.log('[Auth] resolveMissingProfile: doc already existed on server, no write performed');
        }

        // Deliberately do NOT call setProfile()/stopLoading() here. The
        // onSnapshot listener already attached below will receive whatever
        // was just committed (or was already there) and resolve loading /
        // profile from that single source of truth, so there is never a
        // moment where local state and Firestore disagree.
      } catch (err) {
        console.error('[Auth] Failed to resolve missing employee profile:', err);
      } finally {
        resolvingUidRef.current = null;
      }
    };

    const unsubscribeAuth = onAuthStateChanged(auth, (authUser) => {
      console.log('[Auth] auth state changed:', authUser ? authUser.uid : 'signed out');
      setUser(authUser);

      // Cleanup previous profile listener if any
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (authUser) {
        startLoading('auth user present, waiting on profile');
        const docPath = `employees/${authUser.uid}`;

        unsubscribeProfile = onSnapshot(doc(db, 'employees', authUser.uid), (docSnap) => {
          const fromCache = docSnap.metadata.fromCache;
          console.log('[Auth] profile snapshot received, exists:', docSnap.exists(), 'fromCache:', fromCache);

          if (docSnap.exists()) {
            // A cached copy is enough to unblock the UI immediately. This is
            // what makes "browser restart / power outage / offline reconnect
            // / returning after days" instant instead of stuck on a spinner:
            // with the persistent Firestore cache (see lib/firebase.ts), the
            // last known employee doc — including status: 'active' and all
            // HR-entered fields — is available right away, even offline.
            // The listener will silently refresh again once the real server
            // snapshot arrives, but nothing here is destructive either way.
            setProfile({ id: docSnap.id, ...docSnap.data() } as Employee);
            stopLoading('profile doc exists');
          } else if (fromCache) {
            // Ambiguous, and NOT a verdict: there is no local cache entry
            // for this employee, but we have not heard from the server yet
            // either. This is exactly the situation that used to cause
            // "active -> pending" — a temporary, cache-only absence being
            // treated as proof the employee doesn't exist. We deliberately
            // do nothing here and wait for the next snapshot, which will be
            // server-confirmed one way or the other.
            console.log('[Auth] no cached profile yet — waiting for server confirmation before concluding anything');
          } else {
            // The server itself has now confirmed there is no document for
            // this uid. Only at this point is it safe to look at creating
            // one (and even then, resolveMissingProfile re-verifies this
            // inside a transaction before writing anything).
            void resolveMissingProfile(authUser);
          }
        }, (error) => {
          // If the error happens during sign-out or session transition, ignore it
          if (auth.currentUser) {
            if (error.message.includes('insufficient permissions')) {
              handleFirestoreError(error, OperationType.GET, docPath);
            } else {
              console.error('[Auth] profile sync error:', error);
            }
          }
          stopLoading('onSnapshot error');
        });
      } else {
        setProfile(null);
        stopLoading('no authenticated user');
        resolvingUidRef.current = null;
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
    };
  }, []);

  const isAdmin = profile?.role === 'HR-MASTER' || profile?.role === 'GM-MASTER';

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
//