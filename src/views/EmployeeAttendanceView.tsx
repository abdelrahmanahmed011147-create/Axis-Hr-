import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Attendance, LeaveRequest, Settings } from '../types';
import { 
  Calendar, 
  Clock, 
  AlertTriangle, 
  FileText, 
  ChevronRight, 
  UserCheck, 
  UserX,
  Sun,
  Coffee,
  CheckCircle,
  XCircle,
  HelpCircle,
  Info
} from 'lucide-react';
import { cn, formatTimeTo12Hour, formatDelayToArabic, calculatePermissionHours } from '../lib/utils';
import { motion } from 'motion/react';
import { toast } from 'react-hot-toast';

export const EmployeeAttendanceView: React.FC = () => {
  const { profile } = useAuth();
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<'current' | 'last' | 'all'>('current');

  useEffect(() => {
    if (!profile?.roleCode) {
      // No roleCode assigned yet (e.g. new employee pending admin setup).
      // We never subscribe to anything in this case, so nothing will ever
      // call setLoading(false) on its own — stop loading explicitly or
      // this screen spins forever.
      setLoading(false);
      return;
    }

    setLoading(true);

    // Fetch attendance for current employee
    const attQuery = query(
  collection(db, 'attendance'),
  where('userId', '==', profile.id)
);

    const unsubAttendance = onSnapshot(attQuery, (snap) => {
      const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() } as Attendance));
      // Sort in descending order by date on the client side
      fetched.sort((a, b) => b.date.localeCompare(a.date));
      setAttendance(fetched);
      setLoading(false);
    }, (error) => {
      console.error("Attendance fetch error for employee:", error);
      toast.error("حدث خطأ أثناء تحميل سجل الحضور");
      setLoading(false);
    });

    // Fetch requests for current employee to sync stats (approved leaves, vacations)
    const reqQuery = query(
      collection(db, 'requests'),
      where('roleCode', '==', profile.roleCode)
    );

    const unsubRequests = onSnapshot(reqQuery, (snap) => {
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as LeaveRequest)));
    }, (error) => {
      console.error("Requests fetch error for employee:", error);
    });

    // Fetch settings to get configured monthly permission hours
    const unsubSettings = onSnapshot(doc(db, 'settings', 'system_config'), (snap) => {
      if (snap.exists()) {
        setSettings(snap.data() as Settings);
      }
    }, (error) => {
      console.error("Settings fetch error:", error);
    });

    return () => {
      unsubAttendance();
      unsubRequests();
      unsubSettings();
    };
  }, [profile?.roleCode]);

  // Determine date ranges for client side filters
  const getFilteredLogs = () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonthNum = now.getMonth(); // 0-indexed

    return attendance.filter(log => {
      if (dateFilter === 'all') return true;

      const logDate = new Date(log.date);
      const logYear = logDate.getFullYear();
      const logMonth = logDate.getMonth();

      if (dateFilter === 'current') {
        return logYear === currentYear && logMonth === currentMonthNum;
      } else if (dateFilter === 'last') {
        // Handle previous month boundary
        const targetYear = currentMonthNum === 0 ? currentYear - 1 : currentYear;
        const targetMonth = currentMonthNum === 0 ? 11 : currentMonthNum - 1;
        return logYear === targetYear && logMonth === targetMonth;
      }
      return true;
    });
  };

  const filteredLogs = getFilteredLogs();

  const getVacationDurationDays = (req: LeaveRequest) => {
    if (!req.fromDate || !req.toDate) return 1;
    const start = new Date(req.fromDate);
    const end = new Date(req.toDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 1;
    const diffTime = end.getTime() - start.getTime();
    if (diffTime < 0) return 1;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
  };

  const getRemainingBalances = () => {
    const now = new Date();
    const currentYear = now.getFullYear();

    // Calculate approved permissions in hours within the target filter month/period
    const targetApprovedPermissions = requests.filter(r => {
      if (r.type !== 'permission' || r.status !== 'Approved') return false;
      const rDate = new Date(r.date);
      // Filter by the selected dateFilter month
      if (dateFilter === 'all') {
        return rDate.getFullYear() === now.getFullYear() && rDate.getMonth() === now.getMonth();
      }
      if (dateFilter === 'current') {
        return rDate.getFullYear() === now.getFullYear() && rDate.getMonth() === now.getMonth();
      } else {
        // Last month
        const targetYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
        const targetMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
        return rDate.getFullYear() === targetYear && rDate.getMonth() === targetMonth;
      }
    });

    const usedPermissionHours = targetApprovedPermissions.reduce((acc, r) => {
      const h = r.fromTime && r.toTime ? calculatePermissionHours(r.fromTime, r.toTime) : (r.hours || 2);
      return acc + h;
    }, 0);
    const totalPermissionLimit = 5;
    const remainingPermissionHours = Math.max(0, totalPermissionLimit - usedPermissionHours);

    // Calculate approved regular vacations within the current calendar year
    const currentYearApprovedVacations = requests.filter(r => {
      if (r.type !== 'vacation_regular' || r.status !== 'Approved') return false;
      const rDate = new Date(r.date || r.fromDate || '');
      return rDate.getFullYear() === currentYear;
    });

    const usedVacationDays = currentYearApprovedVacations.reduce((acc, r) => acc + getVacationDurationDays(r), 0);
    const totalVacationLimit = 21; // Standard annual vacation days in Egypt
    const remainingVacationDays = Math.max(0, totalVacationLimit - usedVacationDays);

    return {
      remainingPermissionHours,
      totalPermissionLimit,
      usedPermissionHours,
      remainingVacationDays,
      totalVacationLimit,
      usedVacationDays,
    };
  };

  const balances = getRemainingBalances();

  // Stats calculation based on filtered logs and approved requests
  const getStats = () => {
    const presentDays = filteredLogs.length;
    const totalDelay = filteredLogs.reduce((acc, curr) => acc + (curr.delayMinutes || 0), 0);
    const totalDeductions = filteredLogs.reduce((acc, curr) => acc + (curr.deductionValue || 0), 0);

    // Calculate approved permissions in hours within target month/period
    const approvedPermissions = requests.filter(r => {
      if (r.type !== 'permission' || r.status !== 'Approved') return false;
      const rDate = new Date(r.date);
      if (dateFilter === 'all') return true;
      const now = new Date();
      if (dateFilter === 'current') {
        return rDate.getFullYear() === now.getFullYear() && rDate.getMonth() === now.getMonth();
      } else {
        const targetYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
        const targetMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
        return rDate.getFullYear() === targetYear && rDate.getMonth() === targetMonth;
      }
    });

    // Calculate total actual hours from approved permissions
    const permissionHours = approvedPermissions.reduce((acc, r) => {
      const h = r.fromTime && r.toTime ? calculatePermissionHours(r.fromTime, r.toTime) : (r.hours || 2);
      return acc + h;
    }, 0);

    // Approved vacations (regular + sick)
    const approvedVacations = requests.filter(r => {
      if ((r.type !== 'vacation_regular' && r.type !== 'vacation_sick') || r.status !== 'Approved') return false;
      const rDate = new Date(r.date || r.fromDate || '');
      if (dateFilter === 'all') return true;
      const now = new Date();
      if (dateFilter === 'current') {
        return rDate.getFullYear() === now.getFullYear() && rDate.getMonth() === now.getMonth();
      } else {
        const targetYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
        const targetMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
        return rDate.getFullYear() === targetYear && rDate.getMonth() === targetMonth;
      }
    });

    return {
      presentDays,
      totalDelay,
      totalDeductions,
      permissionHours,
      permissionCount: approvedPermissions.length,
      vacationDays: approvedVacations.length,
    };
  };

  const stats = getStats();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 border-4 border-[#7C3AED]/20 border-t-[#C084FC] rounded-full animate-spin"></div>
        <p className="text-[#A78BFA] animate-pulse font-medium">جاري تحميل سجل حضورك وانصرافك...</p>
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-5 duration-700 pb-20" dir="rtl">
      {/* Header section */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-6">
        <div>
          <h3 className="text-4xl font-black tracking-tight mb-2">سجل الحضور والانصراف الخاص بك</h3>
          <p className="text-[#A78BFA] text-lg">تتبع دقيق لأيام حضورك، ساعات التأخر، والأذونات المطبقة</p>
        </div>

        <div className="flex bg-white/5 p-1 rounded-2xl border border-white/10 shrink-0">
          <button 
            onClick={() => setDateFilter('current')}
            className={cn("px-6 py-3 rounded-xl text-xs font-black transition-all", dateFilter === 'current' ? "bg-[#7C3AED] text-white shadow-lg" : "text-[#A78BFA] hover:text-white")}
          >الشهر الحالي</button>
          <button 
            onClick={() => setDateFilter('last')}
            className={cn("px-6 py-3 rounded-xl text-xs font-black transition-all", dateFilter === 'last' ? "bg-[#7C3AED] text-white shadow-lg" : "text-[#A78BFA] hover:text-white")}
          >الشهر الماضي</button>
          <button 
            onClick={() => setDateFilter('all')}
            className={cn("px-6 py-3 rounded-xl text-xs font-black transition-all", dateFilter === 'all' ? "bg-[#7C3AED] text-white shadow-lg" : "text-[#A78BFA] hover:text-white")}
          >كل السجلات</button>
        </div>
      </div>

      {/* KPI Stats Widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
        
        {/* Attendance Days */}
        <div className="bg-white/5 backdrop-blur-md p-6 rounded-3xl border border-white/10 flex items-center justify-between hover:bg-white/10 transition-all shadow-xl">
          <div>
            <p className="text-[10px] text-[#A78BFA] uppercase tracking-widest font-black mb-1">أيام الحضور</p>
            <h4 className="text-3xl font-black text-emerald-400">{stats.presentDays} <span className="text-xs opacity-60">أيام</span></h4>
          </div>
          <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-400">
            <UserCheck size={24} />
          </div>
        </div>

        {/* Total Approved Permissions */}
        <div className="bg-white/5 backdrop-blur-md p-6 rounded-3xl border border-white/10 flex items-center justify-between hover:bg-white/10 transition-all shadow-xl">
          <div>
            <p className="text-[10px] text-[#A78BFA] uppercase tracking-widest font-black mb-1">إجمالي الأذونات</p>
            <h4 className="text-3xl font-black text-[#A78BFA] leading-tight">
              {stats.permissionCount} <span className="text-xs opacity-60">أذون</span>
            </h4>
          </div>
          <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-400">
            <Coffee size={24} />
          </div>
        </div>

        {/* Deductions Applied (in Days / Money) */}
        <div className="bg-white/5 backdrop-blur-md p-6 rounded-3xl border border-white/10 flex items-center justify-between hover:bg-white/10 transition-all shadow-xl">
          <div>
            <p className="text-[10px] text-[#A78BFA] uppercase tracking-widest font-black mb-1">إجمالي الخصم</p>
            <h4 className="text-3xl font-black text-rose-400">-{stats.totalDeductions} <span className="text-xs opacity-60">يوم</span></h4>
          </div>
          <div className="w-12 h-12 bg-rose-500/10 rounded-2xl flex items-center justify-center text-rose-400">
            <UserX size={24} />
          </div>
        </div>

        {/* Permissions spent */}
        <div className="bg-white/5 backdrop-blur-md p-6 rounded-3xl border border-white/10 flex flex-col justify-between hover:bg-white/10 transition-all shadow-xl relative overflow-hidden group">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] text-[#A78BFA] uppercase tracking-widest font-black mb-1">ساعات الأذونات</p>
              <h4 className="text-3xl font-black text-blue-400">{stats.permissionHours} <span className="text-xs opacity-60">ساعة</span></h4>
            </div>
            <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-400">
              <Coffee size={24} />
            </div>
          </div>
          <div className="border-t border-white/5 pt-3">
            <div className="flex justify-between items-center text-xs">
              <span className="text-[#A78BFA] text-[10px]">المتبقي هذا الشهر:</span>
              <span className="text-blue-300 font-extrabold text-[11px] font-mono">{balances.remainingPermissionHours} / {balances.totalPermissionLimit} س</span>
            </div>
          </div>
        </div>

        {/* Vacation days */}
        <div className="bg-white/5 backdrop-blur-md p-6 rounded-3xl border border-white/10 flex flex-col justify-between hover:bg-white/10 transition-all shadow-xl relative overflow-hidden group">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] text-[#A78BFA] uppercase tracking-widest font-black mb-1">الإجازات المعتمدة</p>
              <h4 className="text-3xl font-black text-purple-400">{stats.vacationDays} <span className="text-xs opacity-60">يوم</span></h4>
            </div>
            <div className="w-12 h-12 bg-purple-500/10 rounded-2xl flex items-center justify-center text-purple-400">
              <Sun size={24} />
            </div>
          </div>
          <div className="border-t border-white/5 pt-3">
            <div className="flex justify-between items-center text-xs">
              <span className="text-[#A78BFA] text-[10px]">المتبقي السنوي:</span>
              <span className="text-purple-300 font-extrabold text-[11px] font-mono">{balances.remainingVacationDays} / {balances.totalVacationLimit} ي</span>
            </div>
          </div>
        </div>

      </div>

      {/* Remaining Balances Overview Section */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-3 duration-500">
        
        {/* Permission hours balance */}
        <div className="bg-gradient-to-br from-[#7C3AED]/10 to-white/5 backdrop-blur-3xl p-8 rounded-[2.5rem] border border-white/10 relative overflow-hidden shadow-2xl group text-right">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500/30 to-[#7C3AED]/30" />
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-400">
              <Clock size={22} className="group-hover:rotate-12 transition-transform duration-300" />
            </div>
            <div>
              <h4 className="text-lg font-black text-white">رصيد الأذونات الشهرية</h4>
              <p className="text-xs text-[#A78BFA] font-sans">تُحسب الأرصدة تلقائياً بنظام الحكمة لإثبات الإخلاص</p>
            </div>
          </div>

          <div className="flex items-end justify-between mb-4 gap-4">
            <div>
              <span className="text-xs text-white/50 block">المتبقي المتاح للتصريح</span>
              <span className="text-4xl font-extrabold text-blue-400 font-mono">
                {balances.remainingPermissionHours}
                <span className="text-xs text-[#A78BFA] font-medium mr-1.5 font-sans">ساعة</span>
              </span>
            </div>
            <div className="text-left">
              <span className="text-xs text-white/50 block">الرصيد الكلي المسموح به</span>
              <span className="text-xl font-bold text-white/85 font-mono">
                {balances.totalPermissionLimit}
                <span className="text-xs text-[#A78BFA] font-medium mr-1 font-sans">ساعات/شهر</span>
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-2">
            <div className="w-full h-2.5 bg-white/5 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 to-[#7C3AED] rounded-full transition-all duration-700"
                style={{ width: `${Math.min(100, (balances.remainingPermissionHours / balances.totalPermissionLimit) * 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-[#A78BFA]">
              <span>مستهلك: {balances.usedPermissionHours} ساعة</span>
              <span>متاح للاستخدام: {balances.remainingPermissionHours} ساعة</span>
            </div>
          </div>
        </div>

        {/* Vacation days balance */}
        <div className="bg-gradient-to-br from-[#7C3AED]/10 to-white/5 backdrop-blur-3xl p-8 rounded-[2.5rem] border border-white/10 relative overflow-hidden shadow-2xl group text-right">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#7C3AED]/30 to-purple-500/30" />
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-purple-500/10 rounded-2xl flex items-center justify-center text-purple-400">
              <Calendar size={22} className="group-hover:rotate-12 transition-transform duration-300" />
            </div>
            <div>
              <h4 className="text-lg font-black text-white">رصيد الإجازات السنوية المتبقية</h4>
              <p className="text-xs text-[#A78BFA] font-sans">الإجازات الاعتيادية المتبقية لك في هذا العام</p>
            </div>
          </div>

          <div className="flex items-end justify-between mb-4 gap-4">
            <div>
              <span className="text-xs text-white/50 block">الرصيد المتاح حالياً</span>
              <span className="text-4xl font-extrabold text-purple-400 font-mono">
                {balances.remainingVacationDays}
                <span className="text-xs text-[#A78BFA] font-medium mr-1.5 font-sans">أيام</span>
              </span>
            </div>
            <div className="text-left">
              <span className="text-xs text-white/50 block">الرصيد السنوي الأساسي</span>
              <span className="text-xl font-bold text-white/85 font-mono">
                {balances.totalVacationLimit}
                <span className="text-xs text-[#A78BFA] font-medium mr-1 font-sans">يوم/سنة</span>
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-2">
            <div className="w-full h-2.5 bg-white/5 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-[#7C3AED] to-purple-500 rounded-full transition-all duration-700"
                style={{ width: `${Math.min(100, (balances.remainingVacationDays / balances.totalVacationLimit) * 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-[#A78BFA]">
              <span>مستهلك: {balances.usedVacationDays} يوم</span>
              <span>متاح للتقديم: {balances.remainingVacationDays} يوم</span>
            </div>
          </div>
        </div>

      </section>

      {/* Main logs display section */}
      <section className="bg-white/5 backdrop-blur-3xl rounded-[3rem] border border-white/10 overflow-hidden shadow-2xl relative">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#7C3AED]/30 to-transparent" />
        
        <div className="p-8 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#7C3AED]/10 rounded-xl flex items-center justify-center text-[#C084FC]">
              <Calendar size={20} />
            </div>
            <h4 className="text-xl font-black">سجل حركات الحضور والإنصراف التفصيلي</h4>
          </div>
          <span className="text-xs text-[#A78BFA] bg-white/5 px-4 py-2 rounded-xl border border-white/5 font-medium">
             عرض {filteredLogs.length} حركة مسجلة
          </span>
        </div>

        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-right border-collapse min-w-[900px]">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.01]">
                <th className="py-6 px-8 text-[11px] text-[#A78BFA] font-black uppercase tracking-[0.1em]">التاريخ</th>
                <th className="py-6 px-6 text-[11px] text-[#A78BFA] font-black uppercase tracking-[0.1em] text-center">وقت الحضور</th>
                <th className="py-6 px-6 text-[11px] text-[#A78BFA] font-black uppercase tracking-[0.1em] text-center">وقت الانصراف</th>
                <th className="py-6 px-6 text-[11px] text-[#A78BFA] font-black uppercase tracking-[0.1em] text-center">حالة الحضور</th>
                <th className="py-6 px-6 text-[11px] text-[#A78BFA] font-black uppercase tracking-[0.1em] text-center">مدة التأخير</th>
                <th className="py-6 px-6 text-[11px] text-[#A78BFA] font-black uppercase tracking-[0.1em] text-center">الخصم المطبق</th>
                <th className="py-6 px-8 text-[11px] text-[#A78BFA] font-black uppercase tracking-[0.1em] text-right">ملاحظات وسبب الخصم</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-24 text-center">
                    <div className="max-w-md mx-auto space-y-4">
                      <Info size={48} className="mx-auto text-[#7C3AED] opacity-40 animate-bounce" />
                      <h5 className="text-lg font-bold text-white">لا توجد حركات مسجلة</h5>
                      <p className="text-sm text-[#A78BFA] leading-relaxed">لم نجد أي حركات حضور وإنصراف مسجلة لك خلال هذه الفترة المحددة بالخيارات المعروضة بالأعلى.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const checkInDate = log.checkInTime?.toDate ? log.checkInTime.toDate() : (log.checkInTime?.seconds ? new Date(log.checkInTime.seconds * 1000) : null);
                  const checkOutDate = log.checkOutTime?.toDate ? log.checkOutTime.toDate() : (log.checkOutTime?.seconds ? new Date(log.checkOutTime.seconds * 1000) : null);

                  return (
                    <motion.tr 
                      layout 
                      key={log.id} 
                      className="group hover:bg-white/[0.03] transition-all border-b border-white/5"
                    >
                      {/* Date */}
                      <td className="py-6 px-8">
                        <span className="font-black text-white font-mono">{log.date}</span>
                      </td>

                      {/* Check-In Time */}
                      <td className="py-6 px-6 text-center">
                        {checkInDate ? (
                          <span className="font-sans text-white text-md font-semibold bg-[#7C3AED]/10 border border-[#7C3AED]/20 px-3 py-1.5 rounded-lg">
                            {formatTimeTo12Hour(checkInDate)}
                          </span>
                        ) : (
                          <span className="text-[#A78BFA]/45">--:--</span>
                        )}
                      </td>

                      {/* Check-Out Time */}
                      <td className="py-6 px-6 text-center">
                        {checkOutDate ? (
                          <span className="font-sans text-white text-md font-semibold bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 rounded-lg">
                            {formatTimeTo12Hour(checkOutDate)}
                          </span>
                        ) : (
                          <span className="text-rose-400 font-bold bg-rose-500/5 border border-rose-500/10 px-3 py-1.5 rounded-lg text-xs">معلق</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-6 px-6 text-center">
                        <span className={cn(
                          "text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-tighter",
                          (log.delayMinutes || 0) > 0 ? "bg-orange-500/10 text-orange-400" : "bg-emerald-500/10 text-emerald-400"
                        )}>
                          {(log.delayMinutes || 0) > 0 ? 'متأخر' : 'في الموعد'}
                        </span>
                      </td>

                      {/* Delay Minutes */}
                      <td className="py-6 px-6 text-center font-sans">
                        {(log.delayMinutes || 0) > 0 ? (
                          <span className="text-orange-400 font-extrabold text-sm bg-orange-500/5 border border-orange-500/10 px-2.5 py-1.5 rounded-lg leading-tight block">
                            {formatDelayToArabic(log.delayMinutes)}
                          </span>
                        ) : (
                          <span className="text-[#A78BFA]/40">-</span>
                        )}
                      </td>

                      {/* Deduction Value */}
                      <td className="py-6 px-6 text-center font-mono">
                        {(log.deductionValue || 0) > 0 ? (
                          <div className="inline-block text-center bg-rose-500/5 border border-rose-500/10 px-3 py-1.5 rounded-xl">
                            <span className="text-rose-400 font-extrabold text-sm block">
                              -{log.deductionValue} يوم
                            </span>
                            <span className="text-rose-300/80 text-[10px] font-bold block mt-0.5">
                              ({((log.deductionValue * (Number(profile?.basicSalary) || 0)) / 30).toFixed(2)} ج.م)
                            </span>
                          </div>
                        ) : (
                          <span className="text-emerald-400 font-black text-sm">لا يوجد</span>
                        )}
                      </td>

                      {/* Deduction Reason / Remarks */}
                      <td className="py-6 px-8 text-right">
                        {log.deductionReason ? (
                          <p className="text-xs text-[#A78BFA] font-medium italic border-r-2 border-[#7C3AED]/30 pr-3 leading-relaxed">
                            {log.deductionReason}
                          </p>
                        ) : (
                          <span className="text-[#A78BFA]/30 text-xs font-serif">حضور اعتيادي</span>
                        )}
                      </td>
                    </motion.tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Interactive FAQ / Guidance Tips on Performance */}
      <section className="bg-white/5 backdrop-blur-md p-10 rounded-[3rem] border border-white/10 grid grid-cols-1 md:grid-cols-3 gap-8 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-48 h-48 bg-[#C084FC]/5 blur-[70px] pointer-events-none" />
        
        <div>
          <h5 className="font-black text-xl mb-3 text-white flex items-center gap-2">
            <CheckCircle className="text-emerald-400 shrink-0" size={20} />
            فترة السماح اليومية
          </h5>
          <p className="text-sm text-[#A78BFA] leading-relaxed">
            يمنحك النظام مرونة حضور معينة حسب إعدادات المجموعة (مثلاً ١٥ دقيقة سماح). الحضور خلال هذه الفترة لا يحتسب كتأخر مخصوم تيسيراً لك.
          </p>
        </div>

        <div>
          <h5 className="font-black text-xl mb-3 text-white flex items-center gap-2">
            <AlertTriangle className="text-orange-400 shrink-0" size={20} />
            كيف تحتسب الخصومات المادية؟
          </h5>
          <p className="text-sm text-[#A78BFA] leading-relaxed">
            عند تخطي فترة السماح، يبدأ النظام في تصنيف التأخر تدريجياً: ربع يوم حتى ٣٠ دقيقة، نصف يوم للأولى، ويوم كامل بعدها لضمان الالتزام بحقوق العمل.
          </p>
        </div>

        <div>
          <h5 className="font-black text-xl mb-3 text-white flex items-center gap-2">
            <Coffee className="text-blue-400 shrink-0" size={20} />
            طلب الأذونات ومساراتها
          </h5>
          <p className="text-sm text-[#A78BFA] leading-relaxed">
            يمكنك دائماً تقديم طلب "إذن انصراف طارئ" من الصفحة الرئيسية في حال مواجهتك لظرف عائلي أو صحي مفاجئ للمصادقة السريعة من مدير القسم.
          </p>
        </div>
      </section>

    </div>
  );
};