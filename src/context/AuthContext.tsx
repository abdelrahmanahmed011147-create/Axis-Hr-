/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, setDoc, serverTimestamp, query, where, getDocs, collection, writeBatch } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Employee } from '../types';

interface AuthContextType {
  user: User | null;
  profile: Employee | null;
  loading: boolean;
  isAdmin: boolean;
  /**
   * True once we have DEFINITIVELY resolved (loading === false), a Firebase
   * Auth user exists, and NO employees/{uid} document was found for them —
   * i.e. HR has not created/approved an employee profile for this person
   * yet. App.tsx uses this to show the "awaiting HR setup" screen, as
   * opposed to a transient loading state.
   */
  awaitingApproval: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  awaitingApproval: false,
});

// Safety watchdog: loading must never stay true longer than this, no matter
// what path (or non-path) the auth/profile resolution logic takes.
const LOADING_TIMEOUT_MS = 5000;

// The single hardcoded bootstrap account for the system owner. This is the
// ONLY case where we are allowed to create an employees/{uid} business
// profile purely from an auth event, because it is not really "employee
// business data" — it is a fixed, source-controlled identity needed to
// bootstrap the very first HR/admin user (otherwise nobody could ever use
// the HR dashboard to approve anyone, including themselves).
const MASTER_ADMIN_EMAIL = 'abdelrahmanahmed011147@gmail.com';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const isResolvingRef = useRef(false);
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

    // ------------------------------------------------------------------
    // ARCHITECTURE NOTE (read this before touching this function)
    // ------------------------------------------------------------------
    // Employee "approval" is no longer represented by any field on the
    // employee document (no more `status === 'active'`). It is represented
    // purely by the EXISTENCE of employees/{authUser.uid}.
    //
    //   employees/{uid} exists      -> approved, load profile, done.
    //   employees/{uid} MISSING     -> not approved yet. We do NOT invent
    //                                  business data for this person. The
    //                                  only thing we're allowed to do is
    //                                  look for a profile HR already
    //                                  created for this email under a
    //                                  DIFFERENT id (pre-provisioned by HR,
    //                                  or left over from an old sign-in
    //                                  method) and link it to this uid.
    //                                  If nothing is found, we simply leave
    //                                  profile = null and stop loading —
    //                                  the UI shows "awaiting HR setup" and
    //                                  HR creates/updates the employee
    //                                  document from the dashboard.
    //
    // This function therefore NEVER writes a fresh "default employee"
    // object for an ordinary user. The one narrow exception is the
    // hardcoded MASTER_ADMIN_EMAIL bootstrap account, documented above.
    // ------------------------------------------------------------------
    const resolveMissingProfile = async (authUser: User) => {
      const emailLower = authUser.email?.toLowerCase() || '';
      const isMaster = emailLower === MASTER_ADMIN_EMAIL.toLowerCase();

      try {
        // Self-healing / linking: look for an employee document HR already
        // created for this email under a different document id (e.g.
        // pre-provisioned before the employee's first login, or left over
        // from a previous sign-in method).
        const q = query(collection(db, 'employees'), where('email', '==', emailLower));
        const qSnap = await getDocs(q);

        // A record only counts as a valid migration source if it is not
        // itself flagged migrated:true (a migrated:true doc is a preserved
        // backup, not a live record — chaining off it again would either
        // resurrect stale data or, worse, silently do nothing while
        // leaving `profile` stuck at null forever).
        const liveDoc = qSnap.docs.find(d => !d.data().migrated);

        if (liveDoc && liveDoc.id !== authUser.uid) {
          const oldData = liveDoc.data();
          const oldUid = liveDoc.id;

          // Migrate/link the existing HR-created data to this authUser.uid.
          // We copy the data AS-IS — this function must never invent or
          // discard HR business data, only relocate it to the correct id.
          const migratedData = {
            ...oldData,
            email: emailLower,
            fullName: oldData.fullName || authUser.displayName || 'موظف جديد',
            updatedAt: serverTimestamp(),
          };

          // 1) Create the new profile first, carrying over all old data.
          await setDoc(doc(db, 'employees', authUser.uid), migratedData);

          // 2) Migrate every reference (attendance/requests/evaluations)
          //    from oldUid to authUser.uid.
          const batch = writeBatch(db);
          let hasBatchOperations = false;

          const reqsQuery = query(collection(db, 'requests'), where('userId', '==', oldUid));
          const reqsSnap = await getDocs(reqsQuery);
          reqsSnap.forEach(d => {
            batch.update(d.ref, { userId: authUser.uid });
            hasBatchOperations = true;
          });

          const attQuery = query(collection(db, 'attendance'), where('userId', '==', oldUid));
          const attSnap = await getDocs(attQuery);
          attSnap.forEach(d => {
            batch.update(d.ref, { userId: authUser.uid });
            hasBatchOperations = true;
          });

          const evQuery = query(collection(db, 'kpiEvaluations'), where('employeeId', '==', oldUid));
          const evSnap = await getDocs(evQuery);
          evSnap.forEach(d => {
            batch.update(d.ref, { employeeId: authUser.uid });
            hasBatchOperations = true;
          });

          if (hasBatchOperations) {
            await batch.commit();
          }

          // 3) NEVER delete the old profile. Mark it as migrated instead,
          //    so it stays in Firestore permanently as a recoverable
          //    backup. This is a pure additive write (merge: true) — it
          //    cannot destroy data, only annotate it. Even if the process
          //    is interrupted at any point before this line, the old
          //    document is still fully intact and will simply be retried
          //    (harmlessly — same source data) on the next login.
          await setDoc(
            doc(db, 'employees', oldUid),
            {
              migrated: true,
              migratedTo: authUser.uid,
              migratedAt: serverTimestamp(),
            },
            { merge: true }
          );
          console.log(`[Auth] Linked existing HR profile ${oldUid} -> ${authUser.uid} (old doc preserved as backup)`);

          // Resolve immediately from what we just wrote rather than waiting
          // on the onSnapshot listener to re-fire with the server copy.
          setProfile({ id: authUser.uid, ...migratedData } as unknown as Employee);
          stopLoading('linked existing HR-created profile');
        } else if (liveDoc && liveDoc.id === authUser.uid) {
          // Race with another tab/listener that just created this exact
          // doc — adopt it directly instead of leaving profile stuck null.
          setProfile({ id: liveDoc.id, ...liveDoc.data() } as Employee);
          stopLoading('resolved concurrently-created profile');
        } else if (isMaster) {
          // One-time bootstrap for the hardcoded system-owner account only.
          // This is NOT "business data reconstruction" for an employee —
          // it is a fixed identity needed so the very first admin can even
          // reach the HR dashboard to approve everyone else.
          const masterData = {
            roleCode: 'MASTER_ADMIN',
            fullName: authUser.displayName || 'موظف جديد',
            role: 'GM-MASTER',
            company: 'مجموعة أكسس',
            department: 'General',
            jobTitle: 'General Manager',
            phone: authUser.phoneNumber || '',
            email: emailLower,
            createdAt: serverTimestamp(),
          };
          await setDoc(doc(db, 'employees', authUser.uid), masterData);
          setProfile({ id: authUser.uid, ...masterData } as Employee);
          stopLoading('master admin bootstrap');
        } else {
          // No HR-created record exists anywhere for this email, and this
          // is an ordinary employee — NOT our hardcoded bootstrap account.
          // We deliberately do NOT create a document here. Inventing a
          // blank "pending" employee from an auth event is exactly the
          // pattern that caused profiles to be recreated/reset in the old
          // implementation. Instead we simply leave profile = null; the UI
          // shows "awaiting HR setup", and HR creates/updates this
          // person's employees/{uid} (or a pre-provisioned-by-email)
          // document from the dashboard. The next time this function runs
          // for this user, the branch above will find and link it.
          setProfile(null);
          stopLoading('no HR-created profile found — awaiting HR setup');
        }
      } catch (err) {
        console.error('[Auth] Failed to resolve/link employee profile:', err);
        // Never invent a profile on error — just stop loading so the UI
        // isn't stuck, and leave whatever profile state we already had.
        stopLoading('profile resolution failed');
      } finally {
        // Reset the lock so a retry can be attempted on next event.
        isResolvingRef.current = false;
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

        // This direct, id-based listener is the ONLY source of truth for
        // "is this employee approved". It is keyed by the stable Firebase
        // Auth uid, so once a document exists here it will be found
        // instantly and identically on every future login, page refresh,
        // browser restart, or reconnect after a dropped connection —
        // there is no field to fall out of sync and no reason to ever
        // re-derive "approved" from anything else.
        unsubscribeProfile = onSnapshot(doc(db, 'employees', authUser.uid), (docSnap) => {
          console.log('[Auth] profile snapshot received, exists:', docSnap.exists());

          if (docSnap.exists()) {
            // The profile document exists -> the employee is approved.
            // We only ever READ here. Authentication code must never write
            // to this document when it already exists, so HR-entered data
            // (salary, job title, department, ...) can never be touched by
            // a login/reconnect/session-restore event.
            setProfile({ id: docSnap.id, ...docSnap.data() } as Employee);
            stopLoading('profile doc exists');
            isResolvingRef.current = false;
          } else {
            console.log('[Auth] no profile found for authenticated user:', authUser.uid);

            if (isResolvingRef.current) {
              return; // Already handling profile resolution in the background
            }
            isResolvingRef.current = true;

            // Run the heavy link/migration logic off to the side so this
            // onSnapshot callback itself never blocks on it. Importantly,
            // this path NEVER blindly writes a fresh employee document —
            // see resolveMissingProfile's doc comment above.
            void resolveMissingProfile(authUser);
          }
        }, (error) => {
          // If the error happens during sign-out or session transition, ignore it.
          // Crucially: a transient read error (offline, dropped connection,
          // temporary permission hiccup) must NEVER be treated as "the
          // profile doesn't exist" — we simply stop the loading spinner and
          // keep whatever profile we last had. We do not touch Firestore.
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
        isResolvingRef.current = false;
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
    };
  }, []);

  const isAdmin = profile?.role === 'HR-MASTER' || profile?.role === 'GM-MASTER';
  const awaitingApproval = !loading && !!user && !profile;

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, awaitingApproval }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
