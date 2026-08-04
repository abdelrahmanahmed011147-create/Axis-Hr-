import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, serverTimestamp, doc, updateDoc, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { recalculateAttendanceForUserAndDate } from '../lib/attendanceUtils';
import { useAuth } from '../context/AuthContext';
import { getCairoNow, formatCairoDate, formatCairoTime, calculateDeduction, cn, formatTimeTo12Hour, formatDelayToArabic, formatStringTimeTo12Hour, getCairoOffset, calculatePermissionHours } from '../lib/utils';
import { Toaster, toast } from 'react-hot-toast';
import { Clock, Coffee, Send, MapPin, UserCheck, UserX, Sun, Moon, Calendar, X as CloseIcon, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Attendance, LeaveRequest } from '../types';
import { INSPIRATIONS } from '../data/inspirations';

export const EmployeePortal: React.FC = () => {
  const { profile } = useAuth();
  const [todayAttendance, setTodayAttendance] = useState<Attendance | null>(null);
  const [attendanceLoaded, setAttendanceLoaded] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [currentTime, setCurrentTime] = useState(new Date());
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const checkIfMobile = () => {
      // 1. Standard mobile/tablet UA check
      const mobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobi|Tablet/i.test(navigator.userAgent);
      
      // 2. iOS "Request Desktop Site" bypass (presents as Macintosh but has touch points)
      const isIOSBypass = (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
      
      // 3. Android "Request Desktop Site" bypass
      const isAndroidBypass = (navigator.userAgent.includes("Linux") && navigator.maxTouchPoints > 1 && !/Ubuntu|Debian|Fedora|RedHat|ChromeOS/i.test(navigator.userAgent));
      
      // 4. Screen-based heuristics (phones in landscape might have window.innerWidth > 768 but window.innerHeight is very small, e.g., < 500px)
      const isMobileLandscape = (window.innerWidth <= 1024 && window.innerHeight <= 500);
      const isSmallScreen = window.innerWidth <= 768;
      
      setIsMobile(mobileUA || isIOSBypass || isAndroidBypass || isMobileLandscape || isSmallScreen);
    };

    checkIfMobile();
    window.addEventListener('resize', checkIfMobile);
    return () => window.removeEventListener('resize', checkIfMobile);
  }, []);

  const formatLiveClock = (date: Date) => {
    const offset = getCairoOffset(date);
    const localOffset = date.getTimezoneOffset();
    const cairoDate = new Date(date.getTime() + (offset + localOffset) * 60000);
    
    const hours24 = cairoDate.getHours();
    let hours12 = hours24 % 12;
    if (hours12 === 0) {
      hours12 = 12;
    }
    const minsStr = String(cairoDate.getMinutes()).padStart(2, '0');
    const secsStr = String(cairoDate.getSeconds()).padStart(2, '0');
    
    let period = 'صباحًا';
    if (hours24 === 12) {
      period = 'ظهرًا';
    } else if (hours24 > 12) {
      period = 'مساءً';
    } else if (hours24 < 12) {
      period = 'صباحًا';
    }

    return {
      time: `${hours12}:${minsStr}`,
      secs: secsStr,
      period
    };
  };
  
  // Request Modal State
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<{label: string, icon: any, type: string, color: string} | null>(null);
  const [dateType, setDateType] = useState<'today' | 'tomorrow' | 'custom'>('today');
  const [requestForm, setRequestForm] = useState({
    date: formatCairoDate(new Date()),
    reason: '',
    fromTime: '09:00',
    toTime: '11:00',
    fromDate: formatCairoDate(new Date()),
    toDate: formatCairoDate(new Date()),
  });

  useEffect(() => {
    if (dateType === 'today') {
      const d = formatCairoDate(new Date());
      setRequestForm(prev => ({ ...prev, date: d, fromDate: d }));
    } else if (dateType === 'tomorrow') {
      const tom = new Date();
      tom.setDate(tom.getDate() + 1);
      const d = formatCairoDate(tom);
      setRequestForm(prev => ({ ...prev, date: d, fromDate: d }));
    }
  }, [dateType]);

  const [approvedPermission, setApprovedPermission] = useState<any>(null);

  // Derive queryDate dynamically based on currentTime
  const getQueryDate = (time: Date) => {
    let qDate = formatCairoDate(time);
    // If it is exactly midnight (00:00:00 - 00:00:59) in Cairo, we use yesterday's date
    // to fetch the attendance record so they can still register checkout!
    const offset = getCairoOffset(time);
    const localOffset = time.getTimezoneOffset();
    const cairoDate = new Date(time.getTime() + (offset + localOffset) * 60000);
    const cairoHour = cairoDate.getHours();
    const cairoMin = cairoDate.getMinutes();

    if (cairoHour === 0 && cairoMin === 0) {
      const yesterday = new Date(time);
      yesterday.setDate(yesterday.getDate() - 1);
      qDate = formatCairoDate(yesterday);
    }
    return qDate;
  };

  const queryDate = getQueryDate(currentTime);

  useEffect(() => {
    setAttendanceLoaded(false);

    // Sync settings
    const unsubSettings = onSnapshot(doc(db, 'settings', 'system_config'), (docSnap) => {
      setSettings(docSnap.exists() ? docSnap.data() : {});
    }, (error) => {
      console.error("Settings fetch error:", error);
    });

    if (!profile?.id) return;

    // Check queryDate attendance
    const q = query(
      collection(db, 'attendance'), 
      where('userId', '==', profile.id),
      where('date', '==', queryDate)
    );

    const unsubAttendance = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        // Guard against any leftover duplicate docs: always take the
        // earliest-created record as the authoritative check-in.
        const docs = [...snap.docs].sort((a, b) =>
          (a.data().createdAt?.seconds || 0) - (b.data().createdAt?.seconds || 0)
        );
        setTodayAttendance({ id: docs[0].id, ...docs[0].data() } as Attendance);
      } else {
        setTodayAttendance(null);
      }
      setAttendanceLoaded(true);
    }, (error) => {
      console.error("Attendance fetch error:", error);
      setAttendanceLoaded(true);
    });

    // Fetch approved or pending permission for queryDate
    const permQuery = query(
      collection(db, 'requests'),
      where('userId', '==', profile.id),
      where('date', '==', queryDate),
      where('type', '==', 'permission')
    );

    const unsubPermission = onSnapshot(permQuery, (snap) => {
      if (!snap.empty) {
        const found = snap.docs.find(doc => {
          const s = doc.data().status;
          return s === 'Approved' || s === 'Pending';
        });
        if (found) {
          setApprovedPermission({ id: found.id, ...found.data() });
        } else {
          setApprovedPermission(null);
        }
      } else {
        setApprovedPermission(null);
      }
    }, (error) => {
      console.error("Permission fetch error:", error);
    });

    return () => {
      unsubSettings();
      unsubAttendance();
      unsubPermission();
    };
  }, [profile?.id, queryDate]);

  const handleCheckIn = async () => {
    if (!profile) return;
    if (isMobile) {
      toast.error('عذراً، تسجيل الحضور متاح فقط من أجهزة الكومبيوتر المعتمدة.');
      return;
    }
    if (todayAttendance) {
      toast.error('لقد سجلت حضورك اليوم بالفعل.');
      return;
    }
    setLoading(true);
    try {
      // Re-check directly against Firestore right before writing. This closes
      // the race window between page load and the attendance listener
      // resolving, where a user could click Check-In while todayAttendance
      // was still null locally even though a record already exists server-side.
      const dupCheckQuery = query(
        collection(db, 'attendance'),
        where('userId', '==', profile.id),
        where('date', '==', queryDate)
      );
      const dupCheckSnap = await getDocs(dupCheckQuery);
      if (!dupCheckSnap.empty) {
        toast.error('لقد سجلت حضورك اليوم بالفعل.');
        setTodayAttendance({ id: dupCheckSnap.docs[0].id, ...dupCheckSnap.docs[0].data() } as Attendance);
        setLoading(false);
        return;
      }

      const now = getCairoNow();
      const timeStr = formatCairoTime(now, 'HH:mm');
      
      // Determine the shift and corresponding start time
      const currentShift = profile.activeShift || 'morning';
      let effectiveSettings = { ...(settings || {}) };
      
      // Set the shift hours dynamically based on settings or defaults
      let normalStartTime = "09:00";
      if (currentShift === 'evening') {
        normalStartTime = effectiveSettings.eveningStartTime || "12:00";
      } else if (currentShift === 'evening2') {
        normalStartTime = (effectiveSettings as any).evening2StartTime || "13:00";
      } else {
        normalStartTime = effectiveSettings.morningStartTime || "09:00";
      }
      effectiveSettings.workStartTime = normalStartTime;
      
      let permissionApplied = false;
      
      if (approvedPermission) {
        const permFrom = approvedPermission.fromTime || "09:00";
        const permTo = approvedPermission.toTime || "11:00";
        
        // If the permission starts at or before normal workStartTime, it's a morning permission
        if (permFrom <= normalStartTime) {
          effectiveSettings.workStartTime = permTo;
          permissionApplied = true;
        }
      }
      
      const { delayMinutes, deduction, reason } = calculateDeduction(timeStr, effectiveSettings);
      
      const attendanceData: Attendance = {
        userId: profile.id,
        roleCode: profile.roleCode,
        date: queryDate,
        checkInTime: serverTimestamp(),
        delayMinutes,
        deductionValue: deduction,
        deductionReason: permissionApplied 
          ? (approvedPermission?.status === 'Approved' ? `إذن صباحي معتمد: ${reason}` : `إذن صباحي معلق (مؤقت): ${reason}`)
          : reason,
        status: ' حاضر',
        createdAt: serverTimestamp(),
        shift: currentShift,
      };

      await addDoc(collection(db, 'attendance'), attendanceData);
      toast.success('تم تسجيل الحضور بنجاح');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckOut = async () => {
    if (!todayAttendance?.id) return;
    if (isMobile) {
      toast.error('عذراً، تسجيل الانصراف متاح فقط من أجهزة الكومبيوتر المعتمدة.');
      return;
    }
    setLoading(true);
    try {
      await updateDoc(doc(db, 'attendance', todayAttendance.id), {
        checkOutTime: serverTimestamp(),
        status: 'انصراف'
      });
      toast.success('تم تسجيل الانصراف بنجاح');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !selectedRequest) return;
    
    setIsSubmitting(true);
    try {
      const requestData: LeaveRequest = {
        userId: profile.id,
        roleCode: profile.roleCode,
        type: selectedRequest.type as any,
        date: requestForm.date,
        reason: requestForm.reason,
        status: 'Pending',
        createdAt: serverTimestamp(),
        ...(selectedRequest.type === 'permission' ? {
          fromTime: requestForm.fromTime,
          toTime: requestForm.toTime,
          hours: calculatePermissionHours(requestForm.fromTime, requestForm.toTime),
        } : {
          fromDate: requestForm.fromDate,
          toDate: requestForm.toDate,
        })
      };

      await addDoc(collection(db, 'requests'), requestData);
      toast.success(`تم إرسال ${selectedRequest.label} بنجاح`);

      if (selectedRequest.type === 'permission') {
        recalculateAttendanceForUserAndDate(profile.id, requestForm.date);
      }
      setShowRequestModal(false);
      setRequestForm({
        date: formatCairoDate(new Date()),
        reason: '',
        fromTime: '09:00',
        toTime: '11:00',
        fromDate: formatCairoDate(new Date()),
        toDate: formatCairoDate(new Date()),
      });
      setDateType('today');
    } catch (error: any) {
      handleFirestoreError(error, OperationType.WRITE, 'requests');
    } finally {
      setIsSubmitting(false);
    }
  };

  const dayOfMonth = Number(formatCairoDate(currentTime, 'd'));
  const inspirationIndex = (dayOfMonth - 1) % INSPIRATIONS.length;
  const currentInspiration = INSPIRATIONS[inspirationIndex];

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-5 duration-700 pb-10" dir="rtl">
      
      {/* Standalone Inspiring Morning Banner */}
      <motion.div 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="relative group p-[1px] rounded-[3rem] overflow-hidden shadow-2xl"
      >
        {/* Animated outer border aura */}
        <div className={cn(
          "absolute inset-0 bg-gradient-to-r opacity-25 group-hover:opacity-40 transition-opacity duration-1000",
          currentInspiration.gradient
        )} />
        
        {/* Main Banner Body */}
        <div className="glass-card-axis px-8 py-10 md:p-12 rounded-[3rem] relative z-10 flex flex-col md:flex-row items-center justify-between gap-8 overflow-hidden">
          {/* Ambient light blob representing the inspiration color scheme */}
          <div 
            className="absolute -right-20 -top-20 w-80 h-80 rounded-full filter blur-[100px] opacity-25 group-hover:opacity-40 transition-opacity duration-1000"
            style={{ background: `linear-gradient(135deg, ${currentInspiration.glowColor}, transparent)` }}
          />
          <div 
            className="absolute -left-20 -bottom-20 w-80 h-80 rounded-full filter blur-[100px] opacity-15"
            style={{ background: `linear-gradient(135deg, ${currentInspiration.glowColor}, transparent)` }}
          />

          {/* Banner Details */}
          <div className="flex flex-col md:flex-row items-center gap-6 relative z-20 text-center md:text-right w-full md:w-auto">
            {/* Elegant Icon badge with a sparkle / star */}
            <div className={cn(
              "w-16 h-16 rounded-[2rem] flex items-center justify-center font-bold text-2xl select-none shadow-xl shadow-black/30 transition-all duration-700 group-hover:scale-110 group-hover:rotate-12",
              currentInspiration.iconBg
            )}>
              ✦
            </div>
            
            <div className="space-y-3">
              <div className="flex flex-col md:flex-row items-center gap-3">
                <h4 className="text-2xl md:text-3xl font-black text-white tracking-tight leading-none">
                  {currentInspiration.greeting.replace('{name}', profile?.fullName ? profile.fullName.split(' ')[0] : '')}
                </h4>
                <div className="flex items-center gap-1.5 bg-white/5 border border-[#E2B765]/35 px-3.5 py-1.5 rounded-full text-sm text-[#FDE6B0] font-black w-fit h-fit shadow-md backdrop-blur-md">
                  <Calendar size={14} className="text-[#E2B765]" />
                  <span>{formatCairoDate(new Date(), 'EEEE، dd MMMM yyyy')}</span>
                </div>
              </div>
              <p className="text-base md:text-base text-[#D8B4FE]/90 font-bold leading-relaxed max-w-2xl">
                {currentInspiration.quote}
              </p>
            </div>
          </div>

          {/* Sparkle decorative side icon or a visual tag */}
          <div className="hidden lg:flex items-center gap-3 bg-white/5 border border-[#E2B765]/20 px-5 py-3 rounded-full relative z-20 shadow-md">
            <span className="w-2.5 h-2.5 rounded-full bg-[#E2B765] animate-pulse" />
            <span className="text-sm font-black text-[#E2B765] tracking-wider select-none font-mono">AXIS INTERNAL FORCE</span>
          </div>
        </div>
      </motion.div>

      {/* Welcome Section */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2 glass-card-axis p-8 md:p-10 rounded-[3rem] relative overflow-hidden flex flex-col justify-between shadow-2xl group">
          
          {/* Ambient inner glowing bubbles */}
          <div className="absolute -left-10 -top-10 w-72 h-72 rounded-full bg-emerald-500/10 filter blur-[80px] opacity-30 pointer-events-none" />
          <div className="absolute -right-10 -bottom-10 w-72 h-72 rounded-full bg-[#E2B765]/10 filter blur-[80px] opacity-20 pointer-events-none" />

          {/* Banner Title & Tagline */}
          <div className="flex items-center justify-between mb-8 pb-4 border-b border-white/5 relative z-10 w-full">
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-[#E2B765] animate-pulse" />
              <h4 className="text-lg md:text-xl font-black text-white leading-none">مؤشرات تسجيل البصمة اليومية</h4>
            </div>
            <span className="text-[10px] font-black text-[#E2B765] tracking-wider select-none font-mono bg-[#E2B765]/10 px-4 py-2 rounded-full border border-[#E2B765]/25">DAILY TRACKER</span>
          </div>

          {/* Banner Grid containing Check-in, Check-out, and Delay */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10 w-full mt-auto">
            
            {/* 1. Check-In */}
            <div className="bg-white/5 backdrop-blur-md p-6 rounded-2xl border border-white/5 flex flex-col justify-between hover:bg-white/10 transition-all duration-300 shadow-md group/item hover:border-[#E2B765]/35">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-[#A78BFA] font-extrabold">وقت الحضور</span>
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <UserCheck size={16} />
                </div>
              </div>
              <div>
                <p className="text-2xl font-black text-white font-mono tracking-tight leading-none mb-2">
                  {todayAttendance?.checkInTime ? formatTimeTo12Hour(todayAttendance.checkInTime.toDate()) : '--:--'}
                </p>
                <div className="flex items-center gap-1.5">
                  <span className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    todayAttendance?.checkInTime ? "bg-emerald-500 animate-pulse" : "bg-white/20"
                  )} />
                  <span className="text-[10px] font-bold text-white/50">
                    {todayAttendance?.checkInTime ? "تم تسجيل الحضور" : "في انتظار الحضور"}
                  </span>
                </div>
              </div>
            </div>

            {/* 2. Check-Out */}
            <div className="bg-white/5 backdrop-blur-md p-6 rounded-2xl border border-white/5 flex flex-col justify-between hover:bg-white/10 transition-all duration-300 shadow-md group/item hover:border-[#E2B765]/35">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-[#A78BFA] font-extrabold">وقت الانصراف</span>
                <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                  <UserX size={16} />
                </div>
              </div>
              <div>
                <p className="text-2xl font-black text-white font-mono tracking-tight leading-none mb-2">
                  {todayAttendance?.checkOutTime ? formatTimeTo12Hour(todayAttendance.checkOutTime.toDate()) : '--:--'}
                </p>
                <div className="flex items-center gap-1.5">
                  <span className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    todayAttendance?.checkOutTime ? "bg-rose-500 animate-pulse" : "bg-white/20"
                  )} />
                  <span className="text-[10px] font-bold text-white/50">
                    {todayAttendance?.checkOutTime ? "تم تسجيل الانصراف" : todayAttendance?.checkInTime ? "قيد الدوام الحالي" : "في انتظار الحضور أولاً"}
                  </span>
                </div>
              </div>
            </div>

            {/* 3. Delay Duration */}
            <div className="bg-white/5 backdrop-blur-md p-6 rounded-2xl border border-white/5 flex flex-col justify-between hover:bg-white/10 transition-all duration-300 shadow-md group/item hover:border-[#E2B765]/35">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-[#A78BFA] font-extrabold">مدة التأخير</span>
                <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
                  <Clock size={16} />
                </div>
              </div>
              <div>
                <p className={cn(
                  "text-xl font-black font-mono tracking-tight truncate leading-none mb-2",
                  (todayAttendance?.delayMinutes || 0) > 0 ? "text-orange-400" : "text-white"
                )}>
                  {(todayAttendance?.delayMinutes || 0) > 0 ? formatDelayToArabic(todayAttendance.delayMinutes) : 'في الموعد'}
                </p>
                <div className="flex items-center gap-1.5">
                  <span className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    (todayAttendance?.delayMinutes || 0) > 0 ? "bg-orange-500 animate-pulse" : todayAttendance?.checkInTime ? "bg-emerald-500" : "bg-white/20"
                  )} />
                  <span className="text-[10px] font-bold text-white/50">
                    {(todayAttendance?.delayMinutes || 0) > 0 ? "مسجل تأخير اليوم" : todayAttendance?.checkInTime ? "وصول منضبط ومميز!" : "مؤشر الانضباط"}
                  </span>
                </div>
              </div>
            </div>

          </div>
        </div>

        <div className="glass-card-axis-gold p-10 rounded-[3rem] flex flex-col justify-between shadow-2xl relative group overflow-hidden">
           <div className="absolute top-0 right-0 w-32 h-32 bg-[#E2B765]/10 blur-[50px] -z-10 group-hover:scale-150 transition-transform duration-1000" />
           
           <div className="text-center">
              <div className="w-16 h-16 bg-[#E2B765]/20 rounded-2xl flex items-center justify-center text-[#E2B765] mx-auto mb-6 shadow-xl shadow-[#E2B765]/20 border border-[#E2B765]/30">
                <Clock size={32} />
              </div>
              <h4 className="text-xl font-black text-white mb-2">توقيت القاهرة</h4>
              <p className="text-5xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-[#FDE6B0] to-[#E2B765] font-mono">
                {formatLiveClock(currentTime).time}
                <span className="text-sm font-semibold text-[#E2B765] opacity-75 mr-1">:{formatLiveClock(currentTime).secs}</span>
                <span className="text-lg font-black text-[#E2B765] mr-2 block mt-2">{formatLiveClock(currentTime).period}</span>
              </p>
           </div>
           
           <div className="mt-8">
              {/* Shift Selector */}
              <div className="mb-6 text-right" dir="rtl">
                <label className="block text-sm font-black text-[#E2B765] mb-3 mr-1">
                  نظام الحضور (الشيفت الحالي)
                </label>
                
                <div className="grid grid-cols-3 gap-3.5">
                  {/* Morning Shift Card */}
                  <button
                    type="button"
                    disabled={loading || !!todayAttendance}
                    onClick={async () => {
                      if (loading || !!todayAttendance || (profile?.activeShift || 'morning') === 'morning') return;
                      setLoading(true);
                      try {
                        await updateDoc(doc(db, 'employees', profile!.id), {
                          activeShift: 'morning'
                        });
                        toast.success('تم الانتقال إلى الشيفت الصباحي بنجاح');
                      } catch (err: any) {
                        toast.error('حدث خطأ أثناء حفظ الشيفت: ' + err.message);
                      } finally {
                        setLoading(false);
                      }
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center p-4 rounded-2xl border transition-all duration-300 text-center relative overflow-hidden group/btn cursor-pointer",
                      (profile?.activeShift || 'morning') === 'morning'
                        ? "bg-[#E2B765]/20 border-[#E2B765] text-white shadow-[0_4px_20px_rgba(226,183,101,0.25)]"
                        : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:border-white/20 hover:text-white",
                      (loading || !!todayAttendance) && "opacity-60 cursor-not-allowed"
                    )}
                  >
                    {/* Background glow for active */}
                    {(profile?.activeShift || 'morning') === 'morning' && (
                      <div className="absolute inset-0 bg-gradient-to-b from-[#E2B765]/10 to-transparent pointer-events-none" />
                    )}
                    
                    <Sun 
                      size={20} 
                      className={cn(
                        "mb-2 transition-transform duration-300 group-hover/btn:scale-110",
                        (profile?.activeShift || 'morning') === 'morning' ? "text-[#E2B765]" : "text-white/40"
                      )} 
                    />
                    
                    <span className="text-sm font-black mb-1 block">الشيفت الصباحي</span>
                    <span className="text-[10px] font-bold font-mono tracking-tight opacity-80 block">
                      {formatStringTimeTo12Hour(settings?.morningStartTime || "09:00")}
                    </span>
                    <span className="text-[9px] opacity-40 font-bold block my-0.5">إلى</span>
                    <span className="text-[10px] font-bold font-mono tracking-tight opacity-80 block">
                      {formatStringTimeTo12Hour(settings?.morningEndTime || "17:00")}
                    </span>
                  </button>

                  {/* Evening Shift Card */}
                  <button
                    type="button"
                    disabled={loading || !!todayAttendance}
                    onClick={async () => {
                      if (loading || !!todayAttendance || (profile?.activeShift || 'morning') === 'evening') return;
                      setLoading(true);
                      try {
                        await updateDoc(doc(db, 'employees', profile!.id), {
                          activeShift: 'evening'
                        });
                        toast.success('تم الانتقال إلى الشيفت المسائي بنجاح');
                      } catch (err: any) {
                        toast.error('حدث خطأ أثناء حفظ الشيفت: ' + err.message);
                      } finally {
                        setLoading(false);
                      }
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center p-4 rounded-2xl border transition-all duration-300 text-center relative overflow-hidden group/btn cursor-pointer",
                      (profile?.activeShift || 'morning') === 'evening'
                        ? "bg-[#E2B765]/20 border-[#E2B765] text-white shadow-[0_4px_20px_rgba(226,183,101,0.25)]"
                        : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:border-white/20 hover:text-white",
                      (loading || !!todayAttendance) && "opacity-60 cursor-not-allowed"
                    )}
                  >
                    {/* Background glow for active */}
                    {(profile?.activeShift || 'morning') === 'evening' && (
                      <div className="absolute inset-0 bg-gradient-to-b from-[#E2B765]/10 to-transparent pointer-events-none" />
                    )}
                    
                    <Moon 
                      size={18} 
                      className={cn(
                        "mb-2.5 transition-transform duration-300 group-hover/btn:scale-110",
                        (profile?.activeShift || 'morning') === 'evening' ? "text-[#E2B765]" : "text-white/40"
                      )} 
                    />
                    
                    <span className="text-sm font-black mb-1 block">الشيفت المسائي</span>
                    <span className="text-[10px] font-bold font-mono tracking-tight opacity-80 block">
                      {formatStringTimeTo12Hour(settings?.eveningStartTime || "12:00")}
                    </span>
                    <span className="text-[9px] opacity-40 font-bold block my-0.5">إلى</span>
                    <span className="text-[10px] font-bold font-mono tracking-tight opacity-80 block">
                      {formatStringTimeTo12Hour(settings?.eveningEndTime || "21:00")}
                    </span>
                  </button>

                  {/* Evening Shift 2 Card (NEW third shift, 13:00 - 21:00) */}
                  <button
                    type="button"
                    disabled={loading || !!todayAttendance}
                    onClick={async () => {
                      if (loading || !!todayAttendance || (profile?.activeShift || 'morning') === 'evening2') return;
                      setLoading(true);
                      try {
                        await updateDoc(doc(db, 'employees', profile!.id), {
                          activeShift: 'evening2'
                        });
                        toast.success('تم الانتقال إلى الشيفت المسائي بنجاح');
                      } catch (err: any) {
                        toast.error('حدث خطأ أثناء حفظ الشيفت: ' + err.message);
                      } finally {
                        setLoading(false);
                      }
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center p-4 rounded-2xl border transition-all duration-300 text-center relative overflow-hidden group/btn cursor-pointer",
                      (profile?.activeShift || 'morning') === 'evening2'
                        ? "bg-[#E2B765]/20 border-[#E2B765] text-white shadow-[0_4px_20px_rgba(226,183,101,0.25)]"
                        : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:border-white/20 hover:text-white",
                      (loading || !!todayAttendance) && "opacity-60 cursor-not-allowed"
                    )}
                  >
                    {/* Background glow for active */}
                    {(profile?.activeShift || 'morning') === 'evening2' && (
                      <div className="absolute inset-0 bg-gradient-to-b from-[#E2B765]/10 to-transparent pointer-events-none" />
                    )}

                    <Moon
                      size={18}
                      className={cn(
                        "mb-2.5 transition-transform duration-300 group-hover/btn:scale-110",
                        (profile?.activeShift || 'morning') === 'evening2' ? "text-[#E2B765]" : "text-white/40"
                      )}
                    />

                    <span className="text-sm font-black mb-1 block">الشيفت المسائي</span>
                    <span className="text-[10px] font-bold font-mono tracking-tight opacity-80 block">
                      {formatStringTimeTo12Hour((settings as any)?.evening2StartTime || "13:00")}
                    </span>
                    <span className="text-[9px] opacity-40 font-bold block my-0.5">إلى</span>
                    <span className="text-[10px] font-bold font-mono tracking-tight opacity-80 block">
                      {formatStringTimeTo12Hour((settings as any)?.evening2EndTime || "21:00")}
                    </span>
                  </button>
                </div>

                {!!todayAttendance && (
                  <p className="text-[10px] text-white/40 mt-2.5 mr-1 font-medium leading-relaxed">
                    * تم إقفال تعديل الشيفت اليوم لتسجيل حضورك بالفعل بنظام ({
                      todayAttendance.shift === 'evening2' ? 'الشيفت المسائي (13:00)' :
                      todayAttendance.shift === 'evening' ? 'الشيفت المسائي' : 'الشيفت الصباحي'
                    }).
                  </p>
                )}
              </div>
              {(() => {
                if (approvedPermission) {
                  const currentShift = profile?.activeShift || 'morning';
                  const normalStartTime = currentShift === 'evening2'
                    ? ((settings as any)?.evening2StartTime || "13:00")
                    : currentShift === 'evening'
                    ? (settings?.eveningStartTime || "12:00")
                    : (settings?.morningStartTime || "09:00");
                  const permFrom = approvedPermission.fromTime || "09:00";
                  const permTo = approvedPermission.toTime || "11:00";
                  const isMorningPermission = permFrom <= normalStartTime;
                  
                  if (isMorningPermission) {
                    return (
                      <div className="mb-4 bg-amber-500/10 border border-amber-500/20 p-4 rounded-[1.5rem] text-right space-y-1 shadow-md" dir="rtl">
                        <p className="text-[#E2B765] font-extrabold text-sm flex items-center justify-start gap-1">
                          <Clock size={14} />
                          <span>إذن حضور صباحي معتمد</span>
                        </p>
                        <p className="text-[11px] text-white/80 leading-relaxed font-bold">
                          لديك إذن معتمد اليوم من الساعة <span className="font-mono text-[#E2B765]">{formatStringTimeTo12Hour(permFrom)}</span> إلى <span className="font-mono text-[#E2B765]">{formatStringTimeTo12Hour(permTo)}</span>.
                        </p>
                        <p className="text-[10px] text-white/50 leading-relaxed">
                          يبدأ احتساب التأخير والخصومات اليوم من الساعة <span className="font-mono text-[#E2B765]">{formatStringTimeTo12Hour(permTo)}</span> بدلاً من الساعة <span className="font-mono">{formatStringTimeTo12Hour(normalStartTime)}</span>.
                        </p>
                      </div>
                    );
                  } else {
                    return (
                      <div className="mb-4 bg-blue-500/10 border border-blue-500/20 p-4 rounded-[1.5rem] text-right space-y-1 shadow-md" dir="rtl">
                        <p className="text-blue-400 font-extrabold text-sm flex items-center justify-start gap-1">
                          <Clock size={14} />
                          <span>إذن مغادرة مؤقتة معتمد اليوم</span>
                        </p>
                        <p className="text-[11px] text-white/80 leading-relaxed font-bold">
                          لديك إذن معتمد في منتصف اليوم من الساعة <span className="font-mono text-blue-300">{formatStringTimeTo12Hour(permFrom)}</span> إلى <span className="font-mono text-blue-300">{formatStringTimeTo12Hour(permTo)}</span>.
                        </p>
                        <p className="text-[10px] text-white/50 leading-relaxed">
                          هذا الإذن مسجل ولا يؤثر على حضورك الصباحي أو تسجيل انصرافك وتعمل المنظومة بشكل طبيعي تماماً.
                        </p>
                      </div>
                    );
                  }
                }
                return null;
              })()}
              {isMobile ? (
                 <div className="bg-rose-500/10 border border-rose-500/20 p-5 rounded-[2rem] text-center space-y-3 shadow-lg shadow-rose-500/5">
                   <div className="w-10 h-10 bg-rose-500/10 rounded-xl flex items-center justify-center text-rose-400 mx-auto border border-rose-500/20">
                     <UserX size={18} />
                   </div>
                   <div>
                     <p className="text-rose-400 font-extrabold text-sm">تفعيل البصمة مغلق على الهاتف</p>
                     <p className="text-[10px] text-white/50 leading-relaxed font-bold mt-1" dir="rtl">
                       تسجيل الحضور والانصراف متاح فقط عبر أجهزة الكومبيوتر أو اللابتوب المعتمدة لضمان أمان معلومات اليومية.
                     </p>
                   </div>
                 </div>
               ) : !attendanceLoaded ? (
                <button 
                  disabled
                  className="w-full py-5 rounded-[2rem] bg-white/5 text-white/30 border border-white/10 cursor-not-allowed"
                >
                  <div className="flex items-center justify-center gap-3">
                    <Loader2 size={20} className="animate-spin" />
                    <span>جاري التحقق من حالة حضورك...</span>
                  </div>
                </button>
              ) : !todayAttendance ? (
                <button 
                  onClick={handleCheckIn}
                  disabled={loading}
                  className="w-full gold-glow-button py-5 rounded-[2rem]"
                >
                  <div className="flex items-center justify-center gap-3">
                    <UserCheck size={24} />
                    <span>تسجيل الدخول</span>
                  </div>
                </button>
              ) : (
                <button 
                  onClick={handleCheckOut}
                  disabled={loading || !!todayAttendance.checkOutTime}
                  className={cn(
                    "w-full py-5 rounded-[2rem] font-black text-lg flex items-center justify-center gap-3 transition-all",
                    todayAttendance.checkOutTime 
                      ? "bg-white/5 text-white/20 border border-white/5 cursor-not-allowed" 
                      : "bg-gradient-to-r from-rose-500 to-orange-500 text-white shadow-xl shadow-rose-500/20 active:scale-105"
                  )}
                >
                  <UserX size={24} />
                  {todayAttendance.checkOutTime ? 'تم الانتهاء' : 'تسجيل الخروج'}
                </button>
              )}
           </div>
        </div>
      </section>

      {/* Requests Tools - Simplified to only Permission & Leave Request */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {[
          { label: 'طلب إذن انصراف', icon: Clock, type: 'permission', color: 'bg-indigo-500', desc: 'طلب مغادرة مؤقتة لظروف طارئة أو شخصية أثناء الدوام' },
          { label: 'طلب إجازة', icon: Sun, type: 'vacation_regular', color: 'bg-orange-500', desc: 'طلب إجازة اعتيادية أو عارضة من رصيدك السنوي، أو إجازة مرضية بالتنسيق مع الطبيب' },
        ].map((item, idx) => (
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            key={item.label}
            onClick={() => {
              setSelectedRequest(item);
              setShowRequestModal(true);
            }}
            className="group block relative glass-card-axis-interactive p-8 rounded-[2.5rem] transition-all hover:-translate-y-2 text-right overflow-hidden shadow-xl"
          >
            <div className={cn("w-14 h-14 rounded-2xl mb-6 flex items-center justify-center text-white shadow-2xl scale-100 group-hover:scale-110 group-hover:rotate-6 transition-all", item.color)}>
              <item.icon size={28} />
            </div>
            <h5 className="font-black text-2xl mb-2 text-white group-hover:text-[#FDE6B0] transition-colors">{item.label}</h5>
            <p className="text-base text-[#A78BFA] font-medium leading-relaxed">{item.desc}</p>
            <div className="absolute top-0 right-0 w-24 h-24 bg-[#E2B765]/5 rounded-bl-[4rem] group-hover:translate-x-4 group-hover:-translate-y-4 transition-transform z-0" />
          </motion.button>
        ))}
      </div>

      {/* Request Modal */}
      <AnimatePresence>
        {showRequestModal && selectedRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowRequestModal(false)}
              className="absolute inset-0 bg-[#0c0416]/90 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 40 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 40 }}
              className="relative w-full max-w-xl bg-[#12071F]/90 backdrop-blur-3xl rounded-[2.5rem] md:rounded-[4rem] border-2 border-[#E2B765]/45 shadow-[-20px_20px_100px_rgba(0,0,0,0.6)] p-6 md:p-12 overflow-y-auto max-h-[90vh] custom-scrollbar text-right text-white"
            >
              <div className="absolute top-0 right-0 w-full h-2 bg-gradient-to-r from-transparent via-[#E2B765]/40 to-transparent" />
              
              <button 
                onClick={() => setShowRequestModal(false)}
                className="absolute top-6 left-6 md:top-10 md:left-10 text-[#E2B765] hover:text-white transition-colors z-15"
              >
                <CloseIcon size={28} />
              </button>

              <div className="flex items-center gap-4 md:gap-6 mb-8 md:mb-12 mt-4 md:mt-0">
                <div className={cn("w-16 h-16 md:w-20 md:h-20 rounded-2xl md:rounded-[2rem] flex items-center justify-center text-white shadow-2xl shrink-0", selectedRequest.color)}>
                  <selectedRequest.icon size={32} className="md:w-10 md:h-10" />
                </div>
                <div>
                  <h4 className="text-2xl md:text-3xl font-black text-[#FDE6B0] mb-1 md:mb-2">{selectedRequest.label}</h4>
                  <p className="text-[#A78BFA] text-base md:text-lg">بوابة تقديم الطلبات الإدارية</p>
                </div>
              </div>

              <form onSubmit={handleRequestSubmit} className="space-y-6 md:space-y-10">
                
                {/* Date Selection Mode */}
                <div className="grid grid-cols-3 gap-2 md:gap-3 p-1.5 md:p-2 bg-white/5 rounded-[1.25rem] md:rounded-[1.5rem] border border-[#E2B765]/15">
                  <button 
                    type="button" 
                    onClick={() => setDateType('today')}
                    className={cn("py-2.5 md:py-3 rounded-xl text-[11px] md:text-sm font-black transition-all", dateType === 'today' ? "bg-white/10 text-white shadow-inner" : "text-[#A78BFA]")}
                  >اليوم</button>
                  <button 
                    type="button" 
                    onClick={() => setDateType('tomorrow')}
                    className={cn("py-2.5 md:py-3 rounded-xl text-[11px] md:text-sm font-black transition-all", dateType === 'tomorrow' ? "bg-white/10 text-white shadow-inner" : "text-[#A78BFA]")}
                  >غداً</button>
                  <button 
                    type="button" 
                    onClick={() => setDateType('custom')}
                    className={cn("py-2.5 md:py-3 rounded-xl text-[11px] md:text-sm font-black transition-all", dateType === 'custom' ? "bg-white/10 text-white shadow-inner" : "text-[#A78BFA]")}
                  >تاريخ مخصص</button>
                </div>

                <div className="space-y-6 md:space-y-8">
                  {selectedRequest.type === 'permission' ? (
                    <>
                      {dateType === 'custom' && (
                        <div className="space-y-2">
                          <label className="text-[10px] text-[#A78BFA] px-3 md:px-4 font-black uppercase tracking-widest">تاريخ الإذن</label>
                          <div className="relative group">
                            <Calendar size={18} className="absolute right-4 md:right-5 top-1/2 -translate-y-1/2 text-[#7C3AED]" />
                            <input 
                              type="date"
                              required
                              value={requestForm.date}
                              onChange={e => setRequestForm({...requestForm, date: e.target.value})}
                              className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 md:py-5 pr-12 md:pr-14 pl-4 md:pl-6 text-white text-base md:text-lg font-black outline-none focus:border-[#C084FC]/50 transition-all font-mono"
                            />
                          </div>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-4 md:gap-8">
                        <div className="space-y-2">
                          <label className="text-[10px] text-[#A78BFA] px-3 md:px-4 font-black uppercase tracking-widest">من الساعة</label>
                          <input 
                            type="time"
                            required
                            value={requestForm.fromTime}
                            onChange={e => setRequestForm({...requestForm, fromTime: e.target.value})}
                            className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 md:py-5 px-4 md:px-6 text-white text-lg md:text-xl font-black outline-none focus:border-[#C084FC]/50 transition-all font-mono"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] text-[#A78BFA] px-3 md:px-4 font-black uppercase tracking-widest">إلى الساعة</label>
                          <input 
                            type="time"
                            required
                            value={requestForm.toTime}
                            onChange={e => setRequestForm({...requestForm, toTime: e.target.value})}
                            className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 md:py-5 px-4 md:px-6 text-white text-lg md:text-xl font-black outline-none focus:border-[#C084FC]/50 transition-all font-mono"
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-6 md:space-y-8">
                      {/* Sub-selection drop down for leave regular vs. sick */}
                      <div className="space-y-2">
                        <label className="text-[10px] text-[#A78BFA] px-3 md:px-4 font-black uppercase tracking-widest">نوع الإجازة المطلوبة</label>
                        <select
                          value={selectedRequest.type}
                          onChange={e => setSelectedRequest(prev => prev ? { ...prev, type: e.target.value } : null)}
                          className="w-full bg-[#12071F]/80 border border-white/10 rounded-2xl py-4 md:py-5 px-4 md:px-6 text-white text-base md:text-md font-black focus:border-[#C084FC] outline-none text-right font-sans"
                        >
                          <option value="vacation_regular">إجازة اعتيادية / عارضة</option>
                          <option value="vacation_sick">إجازة مرضية طارئة</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
                        <div className="space-y-2">
                          <label className="text-[10px] text-[#A78BFA] px-3 md:px-4 font-black uppercase tracking-widest">من تاريخ</label>
                          <input 
                            type="date"
                            required
                            disabled={dateType !== 'custom'}
                            value={requestForm.fromDate}
                            onChange={e => setRequestForm({...requestForm, fromDate: e.target.value})}
                            className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 md:py-5 px-4 md:px-6 text-white text-base md:text-lg font-black outline-none focus:border-[#C084FC]/50 transition-all font-mono disabled:opacity-50"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] text-[#A78BFA] px-3 md:px-4 font-black uppercase tracking-widest">إلى تاريخ</label>
                          <input 
                            type="date"
                            required
                            value={requestForm.toDate}
                            onChange={e => setRequestForm({...requestForm, toDate: e.target.value})}
                            className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 md:py-5 px-4 md:px-6 text-white text-base md:text-lg font-black outline-none focus:border-[#C084FC]/50 transition-all font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-[10px] text-[#A78BFA] px-3 md:px-4 font-black uppercase tracking-widest">السبب / الملاحظات</label>
                    <textarea 
                      required
                      rows={3}
                      value={requestForm.reason}
                      onChange={e => setRequestForm({...requestForm, reason: e.target.value})}
                      placeholder="اشرح سبب الطلب بوضوح للإدارة..."
                      className="w-full bg-white/5 border border-white/10 rounded-2xl md:rounded-[2rem] py-4 md:py-6 px-5 md:px-8 text-white text-base md:text-base font-medium outline-none focus:border-[#C084FC]/50 transition-all resize-none placeholder:text-white/20"
                    />
                  </div>
                </div>

                <button 
                  disabled={isSubmitting}
                  className="w-full gold-glow-button py-4 md:py-6 rounded-2xl md:rounded-[2.5rem] text-lg md:text-xl flex items-center justify-center gap-4 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <div className="w-6 h-6 md:w-8 md:h-8 border-4 border-black/35 border-t-black rounded-full animate-spin" />
                  ) : (
                    <>
                      <Send size={20} className="md:w-6 md:h-6" />
                      <span>إرسال الطلب الآن</span>
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

