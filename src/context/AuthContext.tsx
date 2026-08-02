/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, getDoc, setDoc, serverTimestamp, query, where, getDocs, collection, deleteDoc, writeBatch } from 'firebase/firestore';
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const isCreatingProfileRef = useRef(false);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (authUser) => {
      setUser(authUser);
      
      // Cleanup previous profile listener if any
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (authUser) {
        setLoading(true);
        const docPath = `employees/${authUser.uid}`;
        
        unsubscribeProfile = onSnapshot(doc(db, 'employees', authUser.uid), async (docSnap) => {
          if (docSnap.exists()) {
            setProfile({ id: docSnap.id, ...docSnap.data() } as Employee);
            setLoading(false);
            isCreatingProfileRef.current = false;
          } else {
            console.log("No profile found for authenticated user:", authUser.uid);
            
            const emailLower = authUser.email?.toLowerCase() || '';
            const isMaster = emailLower === 'abdelrahmanahmed011147@gmail.com'.toLowerCase();

            // Provide a temporary pending/active profile immediately so the UI doesn't hang
            const tempProfile: Employee = {
              id: authUser.uid,
              roleCode: isMaster ? 'MASTER_ADMIN' : '',
              fullName: authUser.displayName || 'موظف جديد',
              role: isMaster ? 'GM-MASTER' : 'EMPLOYEE',
              company: isMaster ? 'مجموعة أكسس' : '',
              department: isMaster ? 'General' : '',
              jobTitle: isMaster ? 'General Manager' : '',
              phone: authUser.phoneNumber || '',
              email: emailLower,
              status: isMaster ? 'active' : 'pending',
              createdAt: new Date(),
            };

            setProfile(tempProfile);
            setLoading(false);

            if (isCreatingProfileRef.current) {
              return; // Already handling profile creation in the background
            }
            isCreatingProfileRef.current = true;

            // Self-healing & Migration: Check if an employee document exists with same email (created manually by admin)
            try {
              const q = query(collection(db, 'employees'), where('email', '==', emailLower));
              const qSnap = await getDocs(q);

              if (!qSnap.empty) {
                // Found existing manually created employee profile
                const oldDoc = qSnap.docs[0];
                const oldData = oldDoc.data();
                const oldUid = oldDoc.id;

                if (oldUid !== authUser.uid) {
                  // Migrate/Copy data to the new authUser.uid
                  const migratedData = {
                    ...oldData,
                    email: emailLower,
                    fullName: oldData.fullName || authUser.displayName || 'موظف جديد',
                    updatedAt: serverTimestamp(),
                  };

                  await setDoc(doc(db, 'employees', authUser.uid), migratedData);
                  await deleteDoc(doc(db, 'employees', oldUid));

                  // Migrate references in other collections
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
                  console.log(`Successfully migrated profile from ${oldUid} to ${authUser.uid}`);
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
              }
            } catch (createErr) {
              console.error("Failed to auto-create or migrate employee profile:", createErr);
              // Do not set profile to null to keep the temporary local profile visible
            }
          }
        }, (error) => {
          // If the error happens during sign-out or session transition, ignore it
          if (auth.currentUser) {
            if (error.message.includes('insufficient permissions')) {
              handleFirestoreError(error, OperationType.GET, docPath);
            } else {
              console.error("Profile sync error:", error);
            }
          }
          setLoading(false);
        });
      } else {
        setProfile(null);
        setLoading(false);
        isCreatingProfileRef.current = false;
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
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
