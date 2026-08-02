import fs from 'fs';
let code = fs.readFileSync('src/context/AuthContext.tsx', 'utf8');

const replacement = `
const SUPER_ADMIN_EMAILS = [
  'abdelrahmanahmed011147@gmail.com',
  'axisgroup1hr@gmail.com',
  'islam.qassem3@gmail.com'
];

export const isSuperAdminEmail = (email?: string | null) => {
  if (!email) return false;
  return SUPER_ADMIN_EMAILS.includes(email.toLowerCase());
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const isCreatingProfileRef = useRef(false);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (authUser) => {
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (authUser) {
        setLoading(true);
        const docPath = \`employees/\${authUser.uid}\`;
        
        // Log the last login
        try {
          await setDoc(doc(db, 'employees', authUser.uid), { lastLogin: serverTimestamp() }, { merge: true });
        } catch (e) {}

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
            const emailLower = authUser.email?.toLowerCase() || '';
            const isMaster = isSuperAdminEmail(emailLower);

            if (isMaster) {
              const tempProfile: Employee = {
                id: authUser.uid,
                roleCode: 'SUPER_ADMIN',
                fullName: authUser.displayName || 'المدير العام',
                role: 'SUPER_ADMIN',
                company: 'مجموعة أكسس',
                department: 'الإدارة العليا',
                jobTitle: 'Super Admin',
                phone: authUser.phoneNumber || '',
                email: emailLower,
                status: 'active',
                createdAt: new Date(),
              };
              setProfile(tempProfile);
              setUser(authUser);
              setLoading(false);

              if (isCreatingProfileRef.current) return;
              isCreatingProfileRef.current = true;

              try {
                const employeeData = {
                  uid: authUser.uid,
                  roleCode: 'SUPER_ADMIN',
                  fullName: authUser.displayName || 'المدير العام',
                  role: 'SUPER_ADMIN',
                  company: 'مجموعة أكسس',
                  department: 'الإدارة العليا',
                  jobTitle: 'Super Admin',
                  phone: authUser.phoneNumber || '',
                  email: emailLower,
                  status: 'active',
                  mustChangePassword: true,
                  createdAt: serverTimestamp(),
                  createdBy: 'SYSTEM'
                };
                await setDoc(doc(db, 'employees', authUser.uid), employeeData);
                
                // Audit log
                await setDoc(doc(collection(db, 'audit_logs')), {
                  action: 'CREATE_SUPER_ADMIN',
                  targetUserEmail: emailLower,
                  performedBy: 'SYSTEM',
                  timestamp: serverTimestamp()
                });
              } catch (createErr) {
                console.error("Failed to auto-create master profile:", createErr);
              }
            } else {
              toast.error('هذا الحساب غير مصرح له باستخدام النظام.');
              await signOut(auth);
              setUser(null);
              setProfile(null);
              setLoading(false);
            }
          }
        }, (error) => {
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

  const isAdmin = isSuperAdminEmail(profile?.email);
  const isHR = profile?.role === 'HR' || profile?.role === 'SUPER_ADMIN' || profile?.role === 'HR-MASTER' || profile?.role === 'GM-MASTER';

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin: isHR }}>
      {children}
    </AuthContext.Provider>
  );
};
`;

code = code.replace(/export const AuthProvider[\s\S]*\}\);\n\n  const isAdmin = profile\?\.role === 'HR-MASTER' \|\| profile\?\.role === 'GM-MASTER';\n\n  return \(\n    <AuthContext\.Provider value=\{\{ user, profile, loading, isAdmin \}\}>\n      \{children\}\n    <\/AuthContext\.Provider>\n  \);\n\};/, replacement);

fs.writeFileSync('src/context/AuthContext.tsx', code);
