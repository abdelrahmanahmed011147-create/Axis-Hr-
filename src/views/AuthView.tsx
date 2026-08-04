import React, { useState, useEffect } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { auth, getGoogleProvider } from '../lib/firebase';
import { motion } from 'motion/react';
import { Toaster, toast } from 'react-hot-toast';
import { Chrome, Loader2, ShieldCheck, AlertCircle, ExternalLink } from 'lucide-react';
import { CompanyLogo } from '../components/CompanyLogo';

export const AuthView: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [configError, setConfigError] = useState<'permission-denied' | 'unauthorized-domain' | 'network-error' | null>(null);

  // Google Authentication Pattern
  //
  // NOTE: Profile creation / migration (searching by email, merging duplicate
  // records, moving attendance & requests references) is handled EXCLUSIVELY
  // by AuthContext.tsx's onAuthStateChanged listener. It used to be duplicated
  // here too, which created a race condition: both this handler and the
  // AuthContext listener would run the same "create-or-migrate" sequence
  // concurrently on every login, sometimes interleaving writes from one flow
  // with writes from the other. That race is part of what used to make
  // employee records appear to "disappear" after a reconnect/crash.
  // This handler now only performs the actual sign-in; AuthContext is the
  // single source of truth for profile writes, and it never deletes data —
  // old records are preserved and only flagged as migrated.
  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, getGoogleProvider());
      const user = result.user;

      if (!user.email) throw new Error('تعذر جلب البريد الإلكتروني من Google');

      toast.success(`أهلاً بك، ${user.displayName || user.email}`);
    } catch (error: any) {
      if (error.code === 'auth/popup-closed-by-user') {
        toast.error('تم إغلاق نافذة تسجيل الدخول');
        return;
      }
      console.error(error);
      const msg = error.message || '';
      if (error.code === 'auth/unauthorized-domain' || msg.includes('unauthorized-domain') || msg.includes('unauthorized')) {
        setConfigError('unauthorized-domain');
        toast.error('لم يتم تفويض هذا النطاق لمشروع Firebase الخاص بك');
      } else if (error.code === 'auth/network-request-failed' || msg.includes('network')) {
        setConfigError('network-error');
        toast.error('خطأ في الاتصال بالشبكة مع Firebase');
      } else {
        toast.error(error.message || 'فشل تسجيل الدخول عبر Google');
      }
    } finally {
      setLoading(false);
    }
  };

  // Styled SVG-based woven fabric patterns
  const fineThreadyGrid = `url("data:image/svg+xml,%3Csvg width='4' height='4' viewBox='0 0 4 4' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v4M0 1h4' stroke='%23ffffff' stroke-width='0.15' stroke-opacity='0.03' fill='none'/%3E%3C/svg%3E")`;
  const fabricPattern = `url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 8h16M8 0v16' stroke='%237C3AED' stroke-width='0.3' stroke-opacity='0.06' fill='none'/%3E%3Cpath d='M0 0l16 16M0 16L16 0' stroke='%23E2B765' stroke-width='0.25' stroke-opacity='0.04' fill='none'/%3E%3C/svg%3E")`;
  const logoPattern = `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%237C3AED' fill-opacity='0.02'%3E%3Cpath d='M 94 94 Q 125 75 176 24 Q 125 75 106 106 Q 75 125 24 176 Q 75 125 94 94 Z' /%3E%3Cpath d='M 92 108 L 60 70 L 72 70 L 108 92 L 140 130 L 128 130 Z' /%3E%3Ccircle cx='100' cy='100' r='11.4' fill='none' stroke='%237C3AED' stroke-opacity='0.025' stroke-width='6.4' /%3E%3C/g%3E%3Cg fill='%23E2B765' fill-opacity='0.012' transform='translate%2850, 50%29 scale%280.5%29'%3E%3Cpath d='M 94 94 Q 125 75 176 24 Q 125 75 106 106 Q 75 125 24 176 Q 75 125 94 94 Z' /%3E%3Cpath d='M 92 108 L 60 70 L 72 70 L 108 92 L 140 130 L 128 130 Z' /%3E%3Ccircle cx='100' cy='100' r='11.4' fill='none' stroke='%23E2B765' stroke-opacity='0.012' stroke-width='6.4' /%3E%3C/g%3E%3C/svg%3E")`;

  return (
    <div className="min-h-screen bg-transparent flex items-center justify-center p-4 md:p-8 relative overflow-hidden" dir="rtl">
      <Toaster position="top-center" />
      
      {/* 1. LAYERED CANVAS FABRIC BACKGROUND */}
      {/* Canvas deep color base */}
      <div className="absolute inset-0 bg-transparent -z-30" />
 
      {/* Fabric Thread Layer: Fine grid */}
      <div 
        className="absolute inset-0 pointer-events-none select-none brightness-50 -z-20"
        style={{ 
          backgroundImage: fineThreadyGrid,
          backgroundRepeat: 'repeat'
        }} 
      />

      {/* Repeating Logo Pattern in the Background */}
      <div 
        className="absolute inset-0 pointer-events-none select-none opacity-[0.45] -z-20"
        style={{ 
          backgroundImage: logoPattern,
          backgroundRepeat: 'repeat'
        }} 
      />
  
      {/* Fabric Grain Layer: Diagonal twill/linen weave */}
      <div 
        className="absolute inset-0 pointer-events-none select-none opacity-[0.25] mix-blend-color-dodge -z-20"
        style={{ 
          backgroundImage: fabricPattern,
          backgroundRepeat: 'repeat'
        }} 
      />

      {/* 2. SUBTLE WOVEN WATERMARK LOGOS */}
      {/* Left watermark */}
      <div className="absolute -left-[10%] top-[10%] w-[500px] h-[500px] opacity-[0.02] pointer-events-none select-none overflow-hidden text-[#E2B765] -z-10">
        <svg viewBox="0 0 200 200" className="w-full h-full" fill="currentColor">
          <path d="M 94 94 Q 125 75 176 24 Q 125 75 106 106 Q 75 125 24 176 Q 75 125 94 94 Z" />
          <path d="M 92 108 L 60 70 L 72 70 L 108 92 L 140 130 L 128 130 Z" />
          <circle cx="100" cy="100" r="11.4" fill="none" stroke="currentColor" strokeWidth="6.4" />
        </svg>
      </div>

      {/* Right watermark (spinning slowly) */}
      <motion.div 
        animate={{ rotate: 360 }}
        transition={{ duration: 180, repeat: Infinity, ease: 'linear' }}
        className="absolute -right-[15%] bottom-[5%] w-[650px] h-[650px] opacity-[0.015] pointer-events-none select-none overflow-hidden text-[#E2B765] -z-10"
      >
        <svg viewBox="0 0 200 200" className="w-full h-full" fill="currentColor">
          <path d="M 94 94 Q 125 75 176 24 Q 125 75 106 106 Q 75 125 24 176 Q 75 125 94 94 Z" />
          <path d="M 92 108 L 60 70 L 72 70 L 108 92 L 140 130 L 128 130 Z" />
          <circle cx="100" cy="100" r="11.4" fill="none" stroke="currentColor" strokeWidth="6.4" />
        </svg>
      </motion.div>

      {/* 3. COLOURFUL AMBIENT GLOWS */}
      <div className="absolute top-[15%] right-[10%] w-[500px] h-[500px] bg-gradient-to-br from-[#E2B765]/5 to-transparent rounded-full blur-[140px] pointer-events-none -z-20" />
      <div className="absolute bottom-[10%] left-[10%] w-[500px] h-[500px] bg-gradient-to-br from-[#E2B765]/8 to-transparent rounded-full blur-[140px] pointer-events-none -z-20" />

      {/* 4. MAIN CARD SECTION - OUTSIDE BORDER-GRADIENT PANE */}
      <motion.div 
        initial={{ y: 35, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative p-[1.5px] rounded-[3rem] bg-gradient-to-tr from-[#140C20] via-[#E2B765]/35 to-[#1A1024] shadow-[0_0_100px_rgba(226,183,101,0.12)] max-w-xl w-full mx-auto overflow-hidden text-right"
      >
        {/* Colorful flowing highlight ring */}
        <div className="absolute inset-x-0 -top-40 h-80 bg-gradient-to-b from-[#E2B765]/10 to-transparent blur-3xl opacity-60" />

        {/* Inner Card - Highly Glassy, Elegant, Rich Obsidian Dark Screen with Gold Accents */}
        <div className="bg-[#090311]/92 backdrop-blur-3xl p-8 md:p-14 rounded-[2.95rem] relative overflow-hidden flex flex-col items-center border border-[#E2B765]/25 shadow-[inset_0_1px_1px_rgba(255,255,255,0.04),0_25px_60px_-15px_rgba(0,0,0,0.95)]">
          
          {/* Subtle light reflections / Cyber path elements in card background */}
          <div className="absolute inset-0 pointer-events-none opacity-[0.12] glass-card-grid-overlay -z-10" />
          <div className="absolute -top-12 -left-12 w-32 h-32 bg-white/5 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-[#E2B765]/5 rounded-full blur-3xl pointer-events-none" />

          {/* Header Brand */}
          <div className="text-center mb-10 relative z-10 w-full">
            <div className="relative inline-block mb-4">
              <div className="absolute inset-0 bg-[#E2B765]/10 rounded-full blur-2xl opacity-60 scale-125" />
              <CompanyLogo size={105} className="mx-auto" />
            </div>

            <h1 dir="ltr" className="text-xl sm:text-2xl md:text-3xl font-black tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-[#FCE6B1] via-[#E2B765] to-[#FCE6B1] font-sans leading-none flex items-center justify-center gap-2 mb-3 drop-shadow-[0_4px_12px_rgba(226,183,101,0.25)] select-none whitespace-nowrap">
              AXIS GROUP HR SYSTEM
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

          {/* CONFIGURATION ERRORS AS GLASSY NOTIFICATION PANEL */}
          {configError && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/20 backdrop-blur-md rounded-2xl text-right text-xs leading-relaxed text-yellow-250 w-full"
            >
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle size={14} className="text-yellow-400 shrink-0" />
                <strong className="text-yellow-300 font-bold">تنبيه تهيئة قواعد البيانات (Firebase)</strong>
              </div>

              {configError === 'permission-denied' && (
                <div className="space-y-2">
                  <p><strong>السبب:</strong> صلاحيات القراءة العامة لقواعد Firestore معطلة في مشروعك الجديد.</p>
                  <p><strong>طريقة الحل:</strong> اذهب إلى <a href="https://console.firebase.google.com" target="_blank" rel="noopener noreferrer" className="underline font-bold text-yellow-300 inline-flex items-center gap-0.5">Firebase Console <ExternalLink size={10} /></a> لمشروعك <strong>agency-hr</strong>، اختر <strong>Firestore Database</strong> ثم <strong>Rules</strong>، وقم بتعيين القاعدة للعامة:</p>
                  <pre className="bg-black/50 text-left p-3 rounded-xl font-mono text-[9px] text-green-400 overflow-x-auto select-all mt-1">
                    allow read, write: if true;
                  </pre>
                </div>
              )}

              {configError === 'unauthorized-domain' && (
                <div className="space-y-2">
                  <p><strong>السبب:</strong> هذا النطاق غير مفعل في Auth Authorized Domains لمشروعك.</p>
                  <p><strong> الحل:</strong> في Console مشروعك بـ Firebase Authentication اذهب لـ <strong>Settings</strong> ثـم <strong>Authorized domains</strong> وضف النطاق التالي لموقعك الحالي ليتاح تفعيل الدخول:</p>
                  <div className="bg-black/40 p-2 rounded-xl font-mono text-[9.5px] text-green-300 text-left select-all">
                    {window.location.hostname}
                  </div>
                </div>
              )}

              {configError === 'network-error' && (
                <p><strong>السبب:</strong> تعذر إتمام اتصال الشبكة مع خوادم Firebase لـ HR. يرجى مراجعة إشارة الإنترنت أو التأكد من إعدادات المفتاح.</p>
              )}

              <button 
                type="button" 
                onClick={() => setConfigError(null)}
                className="mt-3 w-full bg-white/5 border border-yellow-500/15 hover:bg-white/10 text-yellow-300 rounded-xl py-1 px-3 text-[10px] font-bold transition-all text-center"
              >
                تخطي هذا التنبيه ×
              </button>
            </motion.div>
          )}



          {/* GLOSSY AND COLORFUL ACTION ZONE */}
          <div className="w-full relative z-10 px-1 py-1">
            
            {/* Ambient colorful halo background behind button */}
            <div className="absolute -inset-1 bg-gradient-to-r from-[#E2B765]/30 via-[#E2B765]/55 to-[#E2B765]/15 rounded-3xl blur opacity-35 group-hover:opacity-50 transition duration-1000 -z-10" />

            <div className="relative glass-card-axis p-8 rounded-3xl flex flex-col gap-6 text-center items-center border border-[#E2B765]/20 shadow-inner">
              
              <div className="mb-2">
                <div className="w-12 h-12 bg-[#E2B765]/10 rounded-full flex items-center justify-center text-[#E2B765] mx-auto mb-2 border border-[#E2B765]/20">
                  <ShieldCheck size={24} />
                </div>
                <p className="text-xs md:text-sm text-[#E2B765]/80 mt-1">سجل دخولك المباشر والآمن عبر البريد الرسمي للمجموعة</p>
              </div>

              {/* Secure Google Login Button */}
              <motion.button
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleGoogleLogin}
                disabled={loading}
                className="relative w-full py-5 px-8 rounded-2xl font-black text-white bg-gradient-to-r from-white/[0.04] to-white/[0.08] hover:from-white/[0.08] hover:to-white/[0.14] active:from-white/[0.02] active:to-white/[0.05] transition-all border border-white/10 hover:border-[#E2B765]/45 flex items-center justify-center gap-3 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_10px_25px_rgba(0,0,0,0.45)] group overflow-hidden"
                style={{ minHeight: '64px' }}
              >
                {/* Gloss Glass Shine sweep animation */}
                <span className="absolute inset-x-0 top-0 h-[100px] w-[200%] -translate-x-[70%] -skew-x-[25deg] bg-gradient-to-r from-transparent via-white/10 to-transparent transition-all duration-[1500ms] ease-out group-hover:translate-x-[70%]" />

                {/* Color Glow Overlay on hover */}
                <div className="absolute inset-0 bg-[#E2B765]/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-md -z-10" />

                {loading ? (
                  <Loader2 className="w-6 h-6 animate-spin text-[#E2B765]" />
                ) : (
                  <>
                    <div className="p-2 rounded-lg bg-white/5 border border-white/10 group-hover:bg-white/10 group-hover:border-white/20 transition-all shadow-sm">
                      <svg className="w-6 h-6" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
                      </svg>
                    </div>
                    <span className="text-[#F3F4F6] group-hover:text-white font-extrabold text-[15px] md:text-[18px] tracking-wide font-sans">
                      تسجيل الدخول الفوري بـ Google
                    </span>
                  </>
                )}
              </motion.button>

              <p className="text-xs text-[#A78BFA] opacity-70 max-w-sm mx-auto leading-relaxed mt-1">
                تسجيل الدخول متوفر لموظفي مجموعة أكسس المصرح لهم فقط. يتم الحماية وإثبات الهوية بأمان تام.
              </p>
            </div>
          </div>

          {/* Footer Brand */}
          <div className="mt-12 text-center relative z-10 w-full">
            <p className="text-xs text-[#A78BFA]/50 font-mono tracking-widest uppercase">
              AXIS HUMAN CAPITAL MANAGEMENT SYSTEMS © 2026
            </p>
          </div>

        </div>
      </motion.div>
    </div>
  );
};
