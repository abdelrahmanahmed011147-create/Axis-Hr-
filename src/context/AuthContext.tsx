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
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
});

// Safety watchdog: loading must never stay true longer than this, no matter
// what path (or non-path) the auth/profile resolution logic takes.
const LOADING_TIMEOUT_MS = 5000;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const isCreatingProfileRef = useRef(false);
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

    // Heavy self-healing/migration logic lives here so the onSnapshot
    // callback itself stays lightweight and non-blocking. Business logic
    // is unchanged from before — only extracted and given direct
    // setProfile/stopLoading calls so it no longer depends on the
    // onSnapshot listener re-firing to resolve the loading state.
    const resolveMissingProfile = async (authUser: User) => {
      const emailLower = authUser.email?.toLowerCase() || '';
      const isMaster = emailLower === 'abdelrahmanahmed011147@gmail.com'.toLowerCase();

      // Self-healing & Migration: Check if an employee document exists with same email (created manually by admin)
      try {
        const q = query(collection(db, 'employees'), where('email', '==', emailLower));
        const qSnap = await getDocs(q);

        if (!qSnap.empty) {
          // Found existing manually created employee profile.
          // Skip any doc already marked migrated:true — those are
          // preserved backups, not active source records — so we never
          // treat an old backup as a migration source again.
          const oldDoc = qSnap.docs.find(d => !d.data().migrated) || qSnap.docs[0];
          const oldData = oldDoc.data();
          const oldUid = oldDoc.id;

          if (oldUid !== authUser.uid && !oldData.migrated) {
            // Migrate/Copy data to the new authUser.uid
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
            //    backup. This is a pure additive write (merge: true) —
            //    it cannot destroy data, only annotate it. Even if the
            //    process is interrupted at any point before this line,
            //    the old document is still fully intact.
            await setDoc(
              doc(db, 'employees', oldUid),
              {
                migrated: true,
                migratedTo: authUser.uid,
                migratedAt: serverTimestamp(),
              },
              { merge: true }
            );
            console.log(`[Auth] Successfully migrated profile from ${oldUid} to ${authUser.uid} (old doc preserved as backup)`);

            // Resolve immediately from what we just wrote rather than waiting
            // on the onSnapshot listener to re-fire with the server copy.
            setProfile({ id: authUser.uid, ...migratedData } as Employee);
            stopLoading('migration complete');
          } else {
            // No migration performed (already migrated, or oldUid === authUser.uid).
            // No write happens here, so the profile onSnapshot listener will never
            // re-fire on its own — stop loading explicitly or the UI hangs forever.
            stopLoading('migration skipped (already migrated / same uid)');
          }
        } else {
          // Auto-create new default pending profile
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

          await setDoc(doc(db, 'employees', authUser.uid), employeeData);

          // Resolve immediately from what we just wrote rather than waiting
          // on the onSnapshot listener to re-fire with the server copy.
          setProfile({ id: authUser.uid, ...employeeData } as Employee);
          stopLoading('new profile created');
        }
      } catch (createErr) {
        console.error('[Auth] Failed to auto-create or migrate employee profile:', createErr);
        // If creation fails, stop loading to avoid blocking the UI indefinitely.
        stopLoading('create/migrate failed');
      } finally {
        // Reset the lock so a retry can be attempted on next event.
        isCreatingProfileRef.current = false;
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
          console.log('[Auth] profile snapshot received, exists:', docSnap.exists());

          if (docSnap.exists()) {
            setProfile({ id: docSnap.id, ...docSnap.data() } as Employee);
            stopLoading('profile doc exists');
            isCreatingProfileRef.current = false;
          } else {
            console.log('[Auth] no profile found for authenticated user:', authUser.uid);

            if (isCreatingProfileRef.current) {
              return; // Already handling profile creation in the background
            }
            isCreatingProfileRef.current = true;

            // Run the heavy migration/creation logic off to the side so this
            // onSnapshot callback itself never blocks on it.
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
        isCreatingProfileRef.current = false;
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