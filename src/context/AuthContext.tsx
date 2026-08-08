// نفس imports بتاعتك زي ما هي

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const isCreatingProfileRef = useRef(false);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (authUser) => {
      setUser(authUser);

      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (authUser) {
        setLoading(true);

        unsubscribeProfile = onSnapshot(
          doc(db, 'employees', authUser.uid),
          async (docSnap) => {

            // ✅ الحالة الطبيعية
            if (docSnap.exists()) {
              setProfile({ id: docSnap.id, ...docSnap.data() } as Employee);
              setLoading(false);

              // 🔒 فك اللّوك هنا فقط
              isCreatingProfileRef.current = false;
              return;
            }

            console.log("No profile found:", authUser.uid);

            // 🔒 منع التكرار
            if (isCreatingProfileRef.current) return;
            isCreatingProfileRef.current = true;

            try {
              const emailLower = authUser.email?.toLowerCase() || '';
              const isMaster = emailLower === 'abdelrahmanahmed011147@gmail.com';

              // 🔍 Check existing by email
              const q = query(collection(db, 'employees'), where('email', '==', emailLower));
              const qSnap = await getDocs(q);

              if (!qSnap.empty) {
                const oldDoc = qSnap.docs[0];
                const oldData = oldDoc.data();

                await setDoc(doc(db, 'employees', authUser.uid), {
                  ...oldData,
                  email: emailLower,
                  updatedAt: serverTimestamp(),
                });
              } else {
                // 🆕 Create new
                await setDoc(doc(db, 'employees', authUser.uid), {
                  fullName: authUser.displayName || 'موظف جديد',
                  email: emailLower,
                  phone: authUser.phoneNumber || '',
                  role: isMaster ? 'GM-MASTER' : 'EMPLOYEE',
                  status: isMaster ? 'active' : 'pending',
                  createdAt: serverTimestamp(),
                });
              }

              // ❌ متعملش setLoading(false) هنا
              // ❌ متفكش اللّوك هنا

            } catch (err) {
              console.error("Create profile error:", err);
              setLoading(false);

              // في حالة error بس نفك اللّوك
              isCreatingProfileRef.current = false;
            }
          },
          (error) => {
            console.error("Snapshot error:", error);
            setLoading(false);
          }
        );

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