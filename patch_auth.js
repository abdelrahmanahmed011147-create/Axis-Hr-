import fs from 'fs';

let code = fs.readFileSync('src/views/AuthView.tsx', 'utf8');

// Update imports
code = code.replace(
  /import \{ signInWithEmailAndPassword, sendPasswordResetEmail, createUserWithEmailAndPassword \} from 'firebase\/auth';/,
  "import { signInWithEmailAndPassword, sendPasswordResetEmail, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';"
);

// Add handleGoogleLogin
code = code.replace(
  /const handleLogin = async \(e: React.FormEvent\) => \{/,
  `const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      toast.success('تم تسجيل الدخول بنجاح');
    } catch (error: any) {
      console.error('Google login error:', error);
      toast.error('حدث خطأ أثناء تسجيل الدخول: ' + error.message);
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {`
);

// Add hidden button in footer
code = code.replace(
  /AXIS HUMAN CAPITAL MANAGEMENT SYSTEMS © 2026/,
  `AXIS HUMAN CAPITAL MANAGEMENT SYSTEMS <span onClick={handleGoogleLogin} className="cursor-default" title="تسجيل الدخول للمديرين">©</span> 2026`
);

fs.writeFileSync('src/views/AuthView.tsx', code);
