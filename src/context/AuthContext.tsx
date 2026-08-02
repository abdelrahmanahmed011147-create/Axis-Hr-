/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { doc, onSnapshot, getDoc, setDoc, serverTimestamp, query, where, getDocs, collection, deleteDoc, writeBatch } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Employee } from '../types';
import toast from 'react-hot-toast';

interface AuthContextType {
  user: User | null;
  profile: Employee | null;
  loading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  isSuperAdmin: false,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const isCreatingProfileRef = useRef(false);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (authUser) => {
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
            const data = docSnap.data() as Employee;
            
            if (data.status !== 'active') {
              toast.error('تم تعطيل حسابك. يرجى مراجعة الإدارة.');
              await signOut(auth);
              setUser(null);
              setProfile(null);
              setLoading(false);
              return;
            }

            setUser(authUser);
            setProfile({ id: docSnap.id, ...data } as Employee);
            setLoading(false);
            isCreatingProfileRef.current = false;
          } else {
            console.log("No profile found for authenticated user:", authUser.uid);
            
            const emailLower = authUser.email?.toLowerCase() || '';
            const isMaster = emailLower === 'abdelrahmanahmed011147@gmail.com'.toLowerCase();

            if (isMaster) {
              // Provide a temporary pending/active profile immediately so the UI doesn't hang
              const tempProfile: Employee = {
                id: authUser.uid,
                roleCode: 'MASTER_ADMIN',
                fullName: authUser.displayName || 'موظف جديد',
                role: 'GM-MASTER',
                company: 'مجموعة أكسس',
                department: 'General',
                jobTitle: 'General Manager',
                phone: authUser.phoneNumber || '',
                email: emailLower,
                status: 'active',
                createdAt: new Date(),
              };
              setProfile(tempProfile);
              setUser(authUser);
              setLoading(false);

              if (isCreatingProfileRef.current) {
                return; // Already handling profile creation in the background
              }
              isCreatingProfileRef.current = true;

              try {
                // Auto-create new default pending profile
                const employeeData = {
                  roleCode: 'MASTER_ADMIN',
                  fullName: authUser.displayName || 'المدير العام',
                  role: 'GM-MASTER',
                  company: 'مجموعة أكسس',
                  department: 'General',
                  jobTitle: 'General Manager',
                  phone: authUser.phoneNumber || '',
                  email: emailLower,
                  status: 'active',
                  createdAt: serverTimestamp(),
                };
                await setDoc(doc(db, 'employees', authUser.uid), employeeData);
              } catch (createErr) {
                console.error("Failed to auto-create master profile:", createErr);
              }
            } else {
              // Not master, no profile, security violation -> logout
              toast.error('لا يوجد ملف شخصي مرتبط بهذا الحساب.');
              await signOut(auth);
              setUser(null);
              setProfile(null);
              setLoading(false);
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
        setUser(null);
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
