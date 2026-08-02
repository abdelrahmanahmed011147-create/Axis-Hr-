import React, { useState } from 'react';
import { Mail, Lock, ShieldCheck, Loader2, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';
import { Toaster, toast } from 'react-hot-toast';
import { signInWithEmailAndPassword, sendPasswordResetEmail, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { CompanyLogo } from '../components/CompanyLogo';

export const AuthView = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'login' | 'forgot-password'>('login');

  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      // Important: Call signInWithPopup immediately without any state updates before it to prevent popup blockers
      await signInWithPopup(auth, provider);
      toast.success('تم تسجيل الدخول بنجاح');
    } catch (error: any) {
      console.error('Google login error:', error);
      if (error.code === 'auth/popup-blocked') {
        toast.error('تم حظر النافذة المنبثقة. يرجى السماح بالنوافذ المنبثقة لهذا الموقع.');
      } else if (error.code !== 'auth/cancelled-popup-request') {
        toast.error('حدث خطأ أثناء تسجيل الدخول: ' + error.message);
      }
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('الرجاء إدخال البريد الإلكتروني وكلمة المرور');
      return;
    }

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (error: any) {
      console.error('Login error:', error);
      if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
        if (true) {
          toast.error('البريد الإلكتروني أو كلمة المرور غير صحيحة');
        }
      } else if (error.code === 'auth/wrong-password') {
        toast.error('البريد الإلكتروني أو كلمة المرور غير صحيحة');
      } else if (error.code === 'auth/too-many-requests') {
        toast.error('محاولات كثيرة خاطئة، يرجى المحاولة لاحقاً أو إعادة تعيين كلمة المرور');
      } else {
        toast.error('حدث خطأ أثناء تسجيل الدخول: ' + error.message);
      }
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error('الرجاء إدخال البريد الإلكتروني');
      return;
    }
    
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      toast.success('تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني');
      setView('login');
    } catch (error: any) {
      console.error('Reset password error:', error);
      toast.error('حدث خطأ أثناء إرسال رابط إعادة التعيين');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans" dir="rtl">
      {/* Background Orbs */}
      <div className="absolute top-1/2 left-1/2 -translate-y-1/2 -translate-x-1/2 w-full max-w-[800px] h-[400px] bg-[#E2B765]/5 rounded-full blur-[120px] -z-10" />
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.03] -z-10 mix-blend-overlay" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0A0A0A]/50 to-[#0A0A0A] -z-10" />
      
      <Toaster position="top-center" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-[420px]"
      >
        <div className="glass-card-axis p-8 md:p-10 rounded-[2rem] border border-white/5 relative overflow-hidden shadow-2xl">
          {/* Top Edge Highlight */}
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[#E2B765]/40 to-transparent" />
          
          {/* Header Section */}
          <div className="text-center mb-10">
            <h1 className="text-4xl md:text-5xl font-black text-white flex flex-col items-center gap-4 tracking-tight drop-shadow-lg">
              <CompanyLogo className="w-16 h-16 opacity-90 drop-shadow-[0_0_15px_rgba(226,183,101,0.3)] mb-2" />
              <span className="bg-gradient-to-br from-white via-white to-white/40 bg-clip-text text-transparent">
                AXIS <span className="font-light opacity-70">HR</span>
              </span>
            </h1>
            
            {/* Micro gold accent divider */}
            <div className="flex items-center justify-center gap-2 my-5 w-1/4 mx-auto">
              <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-[#E2B765]/40" />
              <div className="w-2 h-2 rounded-full bg-[#E2B765] shadow-[0_0_10px_rgba(226,183,101,0.8)]" />
              <div className="h-[1px] flex-1 bg-gradient-to-l from-transparent to-[#E2B765]/40" />
            </div>
            
            <p className="text-[#E2B765]/80 text-base md:text-xl font-bold leading-relaxed max-w-md mx-auto mb-1">
              نظام إدارة الموارد البشرية
            </p>
          </div>

          {view === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-white/60 mb-2 px-1">البريد الإلكتروني</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-white/30">
                      <Mail size={18} />
                    </div>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pr-12 pl-4 text-white placeholder-white/20 focus:bg-white/10 focus:border-[#E2B765]/50 focus:ring-1 focus:ring-[#E2B765]/50 transition-all outline-none font-mono"
                      placeholder="name@axis.com"
                      dir="ltr"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-white/60 mb-2 px-1 flex justify-between">
                    كلمة المرور
                    <button
                      type="button"
                      onClick={() => setView('forgot-password')}
                      className="text-[#E2B765] hover:text-[#E2B765]/80 underline decoration-1 underline-offset-4"
                    >
                      نسيت كلمة المرور؟
                    </button>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-white/30">
                      <Lock size={18} />
                    </div>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pr-12 pl-4 text-white placeholder-white/20 focus:bg-white/10 focus:border-[#E2B765]/50 focus:ring-1 focus:ring-[#E2B765]/50 transition-all outline-none font-mono tracking-widest text-lg"
                      placeholder="••••••••"
                      dir="ltr"
                    />
                  </div>
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                disabled={loading}
                type="submit"
                className="w-full mt-2 py-4 px-8 rounded-2xl font-black text-[#0A0A0A] bg-gradient-to-r from-[#E2B765] to-[#D4A34F] hover:shadow-[0_0_20px_rgba(226,183,101,0.4)] transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <ShieldCheck size={20} />
                    <span>تسجيل الدخول</span>
                  </>
                )}
              </motion.button>
            </form>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-5">
              <div className="mb-4 text-center">
                <p className="text-sm text-white/70">أدخل بريدك الإلكتروني المسجل لدينا وسنرسل لك رابطاً لإعادة تعيين كلمة المرور.</p>
              </div>
              
              <div>
                <label className="block text-xs font-bold text-white/60 mb-2 px-1">البريد الإلكتروني</label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-white/30">
                    <Mail size={18} />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pr-12 pl-4 text-white placeholder-white/20 focus:bg-white/10 focus:border-[#E2B765]/50 focus:ring-1 focus:ring-[#E2B765]/50 transition-all outline-none font-mono"
                    placeholder="name@axis.com"
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3 mt-4">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  disabled={loading}
                  type="submit"
                  className="w-full py-4 px-8 rounded-2xl font-black text-[#0A0A0A] bg-gradient-to-r from-[#E2B765] to-[#D4A34F] hover:shadow-[0_0_20px_rgba(226,183,101,0.4)] transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>إرسال الرابط</span>}
                </motion.button>
                
                <button
                  type="button"
                  onClick={() => setView('login')}
                  disabled={loading}
                  className="w-full py-3 px-8 rounded-2xl font-bold text-white/70 hover:text-white hover:bg-white/5 transition-all flex items-center justify-center gap-2"
                >
                  <ArrowRight size={16} />
                  العودة لتسجيل الدخول
                </button>
              </div>
            </form>
          )}

          {/* Footer Brand */}
          <div className="mt-8 text-center relative z-10 w-full">
            <p className="text-[10px] text-white/30 font-mono tracking-widest uppercase">
              AXIS HUMAN CAPITAL MANAGEMENT SYSTEMS <span onClick={handleGoogleLogin} className="cursor-default" title="تسجيل الدخول للمديرين">©</span> 2026
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
