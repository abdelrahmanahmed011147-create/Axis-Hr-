import React, { useState } from 'react';
import { updatePassword, signOut } from 'firebase/auth';
import { doc, updateDoc, collection, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { toast, Toaster } from 'react-hot-toast';
import { Loader2, ShieldAlert } from 'lucide-react';
import { motion } from 'motion/react';
import { CompanyLogo } from '../components/CompanyLogo';

export const ForcePasswordChangeView: React.FC = () => {
  const { user, profile } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('كلمتا المرور غير متطابقتين');
      return;
    }

    if (!user || !profile) return;

    setLoading(true);
    try {
      await updatePassword(user, newPassword);
      await updateDoc(doc(db, 'employees', profile.id), {
        mustChangePassword: false
      });
      await setDoc(doc(collection(db, 'audit_logs')), {
        action: 'CHANGE_PASSWORD',
        targetUserEmail: profile.email,
        performedBy: profile.email,
        timestamp: serverTimestamp()
      });
      toast.success('تم تحديث كلمة المرور بنجاح');
      // No need to redirect, App.tsx will re-render since profile changes or we can force reload
      window.location.reload();
    } catch (error: any) {
      console.error(error);
      if (error.code === 'auth/requires-recent-login') {
        toast.error('يرجى تسجيل الدخول مرة أخرى لتغيير كلمة المرور');
        await signOut(auth);
      } else {
        toast.error('حدث خطأ أثناء تغيير كلمة المرور: ' + error.message);
      }
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4 relative overflow-hidden" dir="rtl">
      <Toaster position="top-center" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[800px] h-[400px] bg-[#E2B765]/5 rounded-full blur-[120px] -z-10" />
      
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-[420px]">
        <div className="glass-card-axis p-8 md:p-10 rounded-[2rem] border border-white/5 relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[#E2B765]/40 to-transparent" />
          
          <div className="text-center mb-8">
            <ShieldAlert size={48} className="mx-auto text-yellow-500 mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">تأمين الحساب</h2>
            <p className="text-white/60 text-sm">
              لأسباب أمنية، يجب عليك تغيير كلمة المرور المؤقتة قبل الاستمرار في استخدام النظام.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-white/60 mb-2 px-1">كلمة المرور الجديدة</label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 text-white placeholder-white/20 focus:bg-white/10 focus:border-[#E2B765]/50 outline-none tracking-widest text-lg"
                dir="ltr"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-white/60 mb-2 px-1">تأكيد كلمة المرور</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 text-white placeholder-white/20 focus:bg-white/10 focus:border-[#E2B765]/50 outline-none tracking-widest text-lg"
                dir="ltr"
              />
            </div>

            <button
              disabled={loading}
              type="submit"
              className="w-full mt-4 py-4 px-8 rounded-2xl font-black text-[#0A0A0A] bg-gradient-to-r from-[#E2B765] to-[#D4A34F] hover:shadow-[0_0_20px_rgba(226,183,101,0.4)] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>تحديث كلمة المرور</span>}
            </button>
            <button
              type="button"
              onClick={() => signOut(auth)}
              className="w-full py-3 px-8 rounded-2xl font-bold text-white/50 hover:text-white hover:bg-white/5 transition-all text-sm mt-2"
            >
              تسجيل الخروج
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
};
