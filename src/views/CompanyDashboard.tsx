import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, orderBy, doc, limit, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { recalculateAttendanceForUserAndDate } from '../lib/attendanceUtils';
import { Employee, Attendance, LeaveRequest } from '../types';
import { useAuth } from '../context/AuthContext';
import { Users, UserCheck, Clock, AlertTriangle, FileText, Check, TrendingUp, Calendar, MapPin, ShieldCheck, AlertCircle, X, Search, Shield } from 'lucide-react';
import { cn, formatCairoDate, formatCairoTime, formatStringTimeTo12Hour } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'react-hot-toast';

export const CompanyDashboard: React.FC = () => {
  const { isAdmin, loading: authLoading } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal and search states for quick dashboard actions
  const [attendanceModalOpen, setAttendanceModalOpen] = useState(false);
  const [requestsModalOpen, setRequestsModalOpen] = useState(false);
  const [searchAttendanceQuery, setSearchAttendanceQuery] = useState('');

  const todayDate = formatCairoDate(new Date());
  type DateFilterType = 'today' | 'yesterday' | 'current_month' | 'last_month' | 'custom';
  const [filterType, setFilterType] = useState<DateFilterType>('today');
  const [customDate, setCustomDate] = useState(todayDate);

  const getFilterLabel = () => {
    switch (filterType) {
      case 'today': return 'اليوم';
      case 'yesterday': return 'أمس';
      case 'current_month': return 'الشهر الحالي';
      case 'last_month': return 'الشهر الماضي';
      case 'custom': return `تاريخ ${customDate}`;
      default: return '';
    }
  };

  const isDateInFilter = (dateStr: string) => {
    if (!dateStr) return false;
    
    const parts = dateStr.split('-');
    if (parts.length !== 3) return false;
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const targetDate = new Date(year, month, day);
    targetDate.setHours(0, 0, 0, 0);
    const targetTime = targetDate.getTime();

    const cleanDate = (d: Date) => {
      const copy = new Date(d);
      copy.setHours(0, 0, 0, 0);
      return copy;
    };

    const now = new Date();

    switch (filterType) {
      case 'today': {
        const todayStart = cleanDate(now);
        return targetTime === todayStart.getTime();
      }
      case 'yesterday': {
        const yesterday = new Date();
        yesterday.setDate(now.getDate() - 1);
        const yesterdayStart = cleanDate(yesterday);
        return targetTime === yesterdayStart.getTime();
      }
      case 'current_month': {
        const startLimit = new Date(now.getFullYear(), now.getMonth(), 1);
        const endLimit = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        return targetTime >= cleanDate(startLimit).getTime() && targetTime <= cleanDate(endLimit).getTime();
      }
      case 'last_month': {
        const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
        return targetTime >= cleanDate(firstOfLastMonth).getTime() && targetTime <= cleanDate(lastOfLastMonth).getTime();
      }
      case 'custom': {
        return dateStr === customDate;
      }
      default:
        return false;
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    const unsubEmployees = onSnapshot(collection(db, 'employees'), (snap) => {
      setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() } as Employee)).filter(e => e.status === 'active'));
    }, (error) => {
      console.error("Employees fetch error:", error);
    });
    const unsubAttendance = onSnapshot(collection(db, 'attendance'), (snap) => {
      setAttendance(snap.docs.map(d => ({ id: d.id, ...d.data() } as Attendance)));
    }, (error) => {
      console.error("Attendance fetch error:", error);
    });
    const unsubRequests = onSnapshot(query(collection(db, 'requests'), orderBy('createdAt', 'desc')), (snap) => {
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as LeaveRequest)));
      setLoading(false);
    }, (error) => {
      console.error("Requests fetch error:", error);
    });

    return () => {
      unsubEmployees();
      unsubAttendance();
      unsubRequests();
    };
  }, []);

  const selectedAttendance = attendance.filter(a => isDateInFilter(a.date));
  const selectedDeductions = attendance
    .filter(a => isDateInFilter(a.date))
    .reduce((acc, curr) => acc + (curr.deductionValue || 0), 0);
  const pendingRequests = requests.filter(r => r.status === 'Pending');
  const activeEmployees = employees.filter(e => e.status === 'active');

  // Compute leaderboards metrics
  const leaderboards = useMemo(() => {
    const activeEmps = employees.filter(e => e.status === 'active');
    
    // 1. Commitment and Attendance stats
    const empAttendanceStats = activeEmps.map(emp => {
      const empLogs = attendance.filter(a => (a.userId && emp.id && a.userId === emp.id) || (a.roleCode && emp.roleCode && a.roleCode.toLowerCase() === emp.roleCode.toLowerCase()));
      const attendCount = empLogs.length;
      const totalDelay = empLogs.reduce((sum, log) => sum + (log.delayMinutes || 0), 0);
      const totalDeductions = empLogs.reduce((sum, log) => sum + (log.deductionValue || 0), 0);
      return {
        employee: emp,
        attendCount,
        totalDelay,
        totalDeductions
      };
    });

    // Most committed: at least 1 attendance, sorted by totalDelay ASC, totalDeductions ASC, then attendCount DESC
    const mostCommitted = [...empAttendanceStats]
      .filter(stat => stat.attendCount > 0)
      .sort((a, b) => {
        if (a.totalDelay !== b.totalDelay) return a.totalDelay - b.totalDelay;
        if (a.totalDeductions !== b.totalDeductions) return a.totalDeductions - b.totalDeductions;
        return b.attendCount - a.attendCount;
      })
      .slice(0, 5);

    // Least committed: at least 1 attendance, has some delay, sorted by totalDelay DESC, then totalDeductions DESC
    const leastCommitted = [...empAttendanceStats]
      .filter(stat => stat.attendCount > 0 && stat.totalDelay > 0)
      .sort((a, b) => {
        if (b.totalDelay !== a.totalDelay) return b.totalDelay - a.totalDelay;
        return b.totalDeductions - a.totalDeductions;
      })
      .slice(0, 5);

    // 2. Request stats
    const empRequestStats = activeEmps.map(emp => {
      const empApprovedRequests = requests.filter(r => ((r.userId && emp.id && r.userId === emp.id) || (r.roleCode && emp.roleCode && r.roleCode.toLowerCase() === emp.roleCode.toLowerCase())) && r.status === 'Approved');
      const vacationsCount = empApprovedRequests.filter(r => 
        r.type === 'vacation_regular' || r.type === 'vacation_sick'
      ).length;
      const permissionsCount = empApprovedRequests.filter(r => r.type === 'permission').length;
      return {
        employee: emp,
        vacationsCount,
        permissionsCount
      };
    });

    // Most vacations: approved vacations > 0, sorted by vacationsCount DESC
    const mostVacations = [...empRequestStats]
      .filter(stat => stat.vacationsCount > 0)
      .sort((a, b) => b.vacationsCount - a.vacationsCount)
      .slice(0, 5);

    // Most permissions: approved permissions > 0, sorted by permissionsCount DESC
    const mostPermissions = [...empRequestStats]
      .filter(stat => stat.permissionsCount > 0)
      .sort((a, b) => b.permissionsCount - a.permissionsCount)
      .slice(0, 5);

    return {
      mostCommitted,
      leastCommitted,
      mostVacations,
      mostPermissions
    };
  }, [employees, attendance, requests]);

  const handleUpdateStatus = async (id: string, status: 'Approved' | 'Rejected') => {
    try {
      const req = requests.find(r => r.id === id);

      await updateDoc(doc(db, 'requests', id), {
        status,
        updatedAt: serverTimestamp(),
        adminComment: status === 'Approved' ? 'تم قبول الطلب من لوحة التحكم السريعة' : 'تم الرفض من لوحة التحكم السريعة'
      });

      if (req && req.type === 'permission' && req.userId) {
        recalculateAttendanceForUserAndDate(req.userId, req.date);
      }

      toast.success(`تم ${status === 'Approved' ? 'قبول' : 'رفض'} الطلب بنجاح 🟢`, {
        style: { direction: 'rtl' }
      });
    } catch (e) {
      console.error(e);
      toast.error('حدث خطأ أثناء تحديث حالة الطلب');
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center p-12 min-h-[400px]">
        <div className="w-12 h-12 border-4 border-[#E2B765]/20 border-t-[#E2B765] rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-8 text-center bg-[#1E0F33]/80 border border-red-500/20 rounded-3xl max-w-lg mx-auto my-12" dir="rtl">
        <div className="w-16 h-16 bg-red-500/10 text-red-400 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-red-500/20">
          <Shield size={32} />
        </div>
        <h2 className="text-xl font-bold text-red-400">غير مصرح بالوصول</h2>
        <p className="text-sm text-[#A78BFA] mt-2">عذراً، هذه الصفحة مخصصة لمدراء النظام فقط ولا يسمح للموظفين بالاطلاع على لوحة بيانات الشركة الإدارية.</p>
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-in fade-in duration-1000">
      <div className="flex flex-col md:flex-row items-center justify-between gap-8">
        <div>
          <motion.h3 
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="text-4xl font-black tracking-tight"
          >
            لوحة تحكم الشركة
          </motion.h3>
          <motion.p 
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-[#A78BFA] text-lg"
          >
            نظرة عامة على أداء وموارد <span className="text-white font-bold">AXIS GROUP</span>
          </motion.p>
        </div>
        <motion.div 
          initial={{ x: 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          className="flex flex-wrap bg-white/5 backdrop-blur-xl p-2 rounded-[1.5rem] border border-white/10 shadow-2xl items-center gap-2"
        >
          <div className="flex items-center gap-2 px-3 text-[#A78BFA] text-xs font-black">
            <Calendar size={16} className="text-[#E2B765]" />
            <span>عرض الفترة:</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(['today', 'yesterday', 'current_month', 'last_month', 'custom'] as DateFilterType[]).map((type) => {
              const labels: Record<DateFilterType, string> = {
                today: 'اليوم',
                yesterday: 'أمس',
                current_month: 'الشهر الحالي',
                last_month: 'الشهر الماضي',
                custom: 'تاريخ مخصص 📅'
              };
              const isActive = filterType === type;
              return (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-black rounded-xl transition-all duration-200",
                    isActive 
                      ? "bg-[#E2B765] text-black shadow-lg shadow-[#E2B765]/20" 
                      : "text-white/70 hover:text-white hover:bg-white/5"
                  )}
                >
                  {labels[type]}
                </button>
              );
            })}
          </div>

          {filterType === 'custom' && (
            <div className="flex items-center gap-1.5 border-r border-white/10 pr-2 mr-1 animate-in fade-in slide-in-from-right-2 duration-300">
              <input 
                type="date" 
                value={customDate}
                onChange={(e) => {
                  if (e.target.value) {
                    setCustomDate(e.target.value);
                  }
                }}
                className="bg-[#1E0F33] text-white font-extrabold text-xs font-mono px-3 py-1.5 rounded-xl border border-white/10 focus:border-[#E2B765] focus:outline-none cursor-pointer [color-scheme:dark]"
              />
            </div>
          )}
        </motion.div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        <StatCard 
          label="إجمالي الموظفين" 
          value={activeEmployees.length} 
          icon={Users} 
          trend="نشط بالنظام"
          gradient="from-blue-600/20 to-indigo-600/20"
          accent="bg-indigo-500"
          delay={0}
        />
        <StatCard 
          label={filterType === 'today' ? "حاضرون اليوم" : `حاضرون (${getFilterLabel()})`} 
          value={selectedAttendance.length} 
          icon={UserCheck} 
          trend={`${Math.round((selectedAttendance.length / (activeEmployees.length || 1)) * 100)}% من القوة`}
          gradient="from-emerald-600/20 to-teal-600/20"
          accent="bg-emerald-500"
          delay={0.1}
          onClick={() => setAttendanceModalOpen(true)}
        />
        <StatCard 
          label="طلبات معلقة" 
          value={pendingRequests.length} 
          icon={AlertTriangle} 
          trend="أولوية مراجعة"
          gradient="from-orange-600/20 to-amber-600/20"
          accent="bg-orange-500"
          delay={0.2}
          onClick={() => setRequestsModalOpen(true)}
        />
        <StatCard 
          label={filterType === 'today' ? "خصومات اليوم" : `خصومات (${getFilterLabel()})`} 
          value={`${selectedDeductions} يوم`} 
          icon={FileText} 
          trend={filterType === 'today' ? "تراكمي لليوم" : `للفترة (${getFilterLabel()})`}
          gradient="from-rose-600/20 to-pink-600/20"
          accent="bg-rose-500"
          delay={0.3}
        />
      </div>

      {/* Analytics & Insights Leaderboards */}
      <div className="space-y-6 pt-4 animate-in fade-in slide-in-from-bottom-6 duration-1000">
        <div>
          <h4 className="text-2xl font-black text-white flex items-center gap-2">
            <span className="text-[#E2B765]">✦</span> تصنيفات ومؤشرات الالتزام والأداء
          </h4>
          <p className="text-xs text-[#A78BFA] mt-1">
            تصنيف تراكمي تفاعلي لسرعة ومواظبة الموظفين بناءً على كشوفات الحضور وطلبات الغياب المعتمدة
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* 1. الأشخاص الأكثر التزاماً */}
          <LeaderboardCard 
            title="الأشخاص الأكثر التزاماً"
            icon={ShieldCheck}
            items={leaderboards.mostCommitted}
            type="most_committed"
            emptyText="لا يوجد موظفين مسجلين حالياً"
          />

          {/* 2. الأشخاص الأقل التزاماً */}
          <LeaderboardCard 
            title="الأشخاص الأقل التزاماً"
            icon={AlertCircle}
            items={leaderboards.leastCommitted}
            type="least_committed"
            emptyText="جميع الموظفين ملتزمون بالوقت! 🎉"
          />

          {/* 3. الأشخاص الأكثر إجازات */}
          <LeaderboardCard 
            title="الأشخاص الأكثر إجازات"
            icon={Calendar}
            items={leaderboards.mostVacations}
            type="most_vacations"
            emptyText="لا توجد إجازات معتمدة بالكامل حتى الآن"
          />

          {/* 4. الأشخاص الأكثر أذونات */}
          <LeaderboardCard 
            title="الأشخاص الأكثر أذونات"
            icon={Clock}
            items={leaderboards.mostPermissions}
            type="most_permissions"
            emptyText="لا توجد أذونات خروج معتمدة حالياً"
          />
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
        
        {/* Attendance Monitor */}
        <motion.section 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="bg-white/5 backdrop-blur-2xl p-8 rounded-[3rem] border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.3)] relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent opacity-20" />
          <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-400 border border-emerald-500/20">
                <Clock size={24} />
              </div>
              <div>
                <h4 className="text-2xl font-bold">آخر عمليات الحضور</h4>
                <p className="text-[10px] text-[#A78BFA] uppercase tracking-widest mt-1">تحديث لحظي ذكي</p>
              </div>
            </div>
          </div>

          <div className="space-y-5">
             {selectedAttendance.length === 0 ? (
               <div className="py-20 text-center text-[#A78BFA] opacity-50 flex flex-col items-center">
                 <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
                    <UserCheck size={32} className="opacity-20" />
                 </div>
                 <p className="text-lg">لا توجد عمليات حضور في التاريخ المحدد</p>
               </div>
             ) : (
               selectedAttendance.slice(0, 6).map((att, i) => {
                 const emp = employees.find(e => e.roleCode === att.roleCode);
                 return (
                   <motion.div 
                     initial={{ opacity: 0, x: -20 }}
                     animate={{ opacity: 1, x: 0 }}
                     transition={{ delay: 0.5 + (i * 0.1) }}
                     key={att.id} 
                     className="group flex items-center justify-between bg-white/5 hover:bg-white/10 p-5 rounded-[1.5rem] border border-white/5 hover:border-emerald-500/30 transition-all duration-300"
                   >
                     <div className="flex items-center gap-4">
                       <div className="w-12 h-12 bg-gradient-to-br from-[#7C3AED] to-[#C084FC] rounded-2xl flex items-center justify-center text-white font-black text-lg shadow-lg group-hover:scale-110 transition-transform">
                         {emp?.fullName?.charAt(0) || '؟'}
                       </div>
                       <div>
                         <p className="text-base font-bold group-hover:text-[#C084FC] transition-colors">{emp?.fullName || 'موظف'}</p>
                         <p className="text-xs text-[#A78BFA] flex items-center gap-1.5">
                           <MapPin size={10} />
                           {emp?.department}
                         </p>
                       </div>
                     </div>
                     <div className="text-left font-mono">
                        <div className="bg-emerald-500/10 px-3 py-1 rounded-lg border border-emerald-500/20">
                          <p className="text-sm font-bold text-emerald-400">{att.checkIn}</p>
                        </div>
                        <p className="text-[10px] text-[#A78BFA] mt-1 mr-1">وقت الدخول</p>
                     </div>
                   </motion.div>
                 );
               })
             )}
          </div>
        </motion.section>

        {/* Requests Insights */}
        <motion.section 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="bg-white/5 backdrop-blur-2xl p-8 rounded-[3rem] border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.3)] relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-orange-500 to-transparent opacity-20" />
          <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-orange-500/10 rounded-2xl flex items-center justify-center text-orange-400 border border-orange-500/20">
                <TrendingUp size={24} />
              </div>
              <div>
                <h4 className="text-2xl font-bold">ملخص الطلبات الواردة</h4>
                <p className="text-[10px] text-[#A78BFA] uppercase tracking-widest mt-1">آخر 10 طلبات نظام</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
             {requests.length === 0 ? (
               <div className="py-20 text-center text-[#A78BFA] opacity-50">لا توجد طلبات واردة للمراجعة</div>
             ) : (
               requests.slice(0, 10).map((req, i) => {
                 const emp = employees.find(e => req.userId ? e.id === req.userId : (req.roleCode && e.roleCode && e.roleCode.toLowerCase() === req.roleCode.toLowerCase()));
                 return (
                   <motion.div 
                     initial={{ opacity: 0, x: 20 }}
                     animate={{ opacity: 1, x: 0 }}
                     transition={{ delay: 0.6 + (i * 0.1) }}
                     key={req.id} 
                     className="flex items-center justify-between p-5 hover:bg-white/5 rounded-2xl transition-all border-b border-white/5 last:border-0 relative group"
                   >
                     <div className="flex items-center gap-5">
                        <div className={cn(
                          "w-3 h-3 rounded-full shadow-[0_0_10px_rgba(0,0,0,0.5)]",
                          req.status === 'Approved' ? "bg-green-500 shadow-green-500/40" : req.status === 'Rejected' ? "bg-red-500 shadow-red-500/40" : "bg-orange-500 shadow-orange-500/40 animate-pulse"
                        )} />
                        <div>
                          <p className="text-base font-bold">{emp?.fullName}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-0.5">
                            <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded-md text-[#A78BFA] border border-white/5 tracking-wider uppercase">
                              {req.type === 'permission' ? 'إذن خروج' : req.type === 'remote' ? 'ريموت' : 'إجازة'}
                            </span>
                            {req.type === 'permission' && (req.fromTime || req.toTime) && (
                              <span className="text-[10px] text-amber-400 font-mono bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/10">
                                {formatStringTimeTo12Hour(req.fromTime)} - {formatStringTimeTo12Hour(req.toTime)}
                              </span>
                            )}
                            {req.type !== 'permission' && req.toDate && (
                              <span className="text-[10px] text-purple-300 font-mono bg-purple-500/10 px-2 py-0.5 rounded-md border border-purple-500/10">
                                إلى {req.toDate}
                              </span>
                            )}
                          </div>
                        </div>
                     </div>
                     <div className="text-left flex flex-col items-end gap-2">
                        <p className="text-[10px] text-[#A78BFA] font-mono opacity-60 flex items-center gap-1.5">
                          <Calendar size={10} />
                          {req.date || req.fromDate}
                        </p>
                        <span className={cn(
                          "text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-tighter shadow-sm",
                          req.status === 'Approved' ? "bg-green-500/20 text-green-400 border border-green-500/30" : 
                          req.status === 'Rejected' ? "bg-red-500/20 text-red-400 border border-red-500/30" : 
                          "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                        )}>
                          {req.status === 'Approved' ? 'مقبول' : req.status === 'Rejected' ? 'مرفوض' : 'معلق'}
                        </span>
                     </div>
                   </motion.div>
                 );
               })
             )}
          </div>
        </motion.section>

      </div>

      {/* Attendance Details Modal */}
      <AnimatePresence>
        {attendanceModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setAttendanceModalOpen(false);
                setSearchAttendanceQuery('');
              }}
              className="fixed inset-0 bg-black/80 backdrop-blur-md"
            />

            {/* Content Container */}
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-[#1C0D2D] border border-white/10 rounded-[2.5rem] w-full max-w-2xl overflow-hidden relative z-10 shadow-[0_25px_60px_rgba(0,0,0,0.8)] flex flex-col max-h-[85vh]"
            >
              {/* Header */}
              <div className="p-8 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-[#1C0D2D] to-[#25103C]">
                <div>
                  <h4 className="text-2xl font-black text-white flex items-center gap-3">
                    <UserCheck className="text-emerald-400" size={26} />
                    سجل الحاضرين ({getFilterLabel()})
                  </h4>
                  <p className="text-xs text-[#A78BFA] mt-1 font-medium">عدد الحاضرين الفعلي: {selectedAttendance.length} موظفاً</p>
                </div>
                <button 
                  onClick={() => {
                    setAttendanceModalOpen(false);
                    setSearchAttendanceQuery('');
                  }}
                  className="w-10 h-10 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-xl flex items-center justify-center border border-white/5 hover:border-white/10 transition-all cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Search Bar */}
              <div className="p-6 border-b border-white/5 bg-white/10">
                <div className="relative">
                  <Search size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#A78BFA]/50" />
                  <input
                    type="text"
                    placeholder="ابحث باسم الموظف أو القسم..."
                    value={searchAttendanceQuery}
                    onChange={(e) => setSearchAttendanceQuery(e.target.value)}
                    className="w-full bg-[#12071F] text-white font-medium text-sm pr-12 pl-4 py-3.5 rounded-2xl border border-white/5 focus:border-[#C084FC] focus:outline-none transition-all placeholder:text-white/30 text-right"
                  />
                </div>
              </div>

              {/* List */}
              <div className="p-8 overflow-y-auto space-y-4 custom-scrollbar flex-1">
                {selectedAttendance.filter(att => {
                  const emp = employees.find(e => e.roleCode === att.roleCode);
                  const fullName = emp?.fullName?.toLowerCase() || '';
                  const dept = emp?.department?.toLowerCase() || '';
                  const queryStr = searchAttendanceQuery.toLowerCase();
                  return fullName.includes(queryStr) || dept.includes(queryStr);
                }).length === 0 ? (
                  <div className="py-16 text-center text-[#A78BFA] opacity-50 flex flex-col items-center">
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4 border border-white/5">
                      <UserCheck size={28} className="opacity-30" />
                    </div>
                    <p className="text-base font-bold">لا توجد عمليات حضور تطابق البحث</p>
                    <p className="text-xs mt-1">يرجى التحقق من الاسم أو تعديل الفلتر الزمني</p>
                  </div>
                ) : (
                  selectedAttendance.filter(att => {
                    const emp = employees.find(e => e.roleCode === att.roleCode);
                    const fullName = emp?.fullName?.toLowerCase() || '';
                    const dept = emp?.department?.toLowerCase() || '';
                    const queryStr = searchAttendanceQuery.toLowerCase();
                    return fullName.includes(queryStr) || dept.includes(queryStr);
                  }).map((att) => {
                    const emp = employees.find(e => e.roleCode === att.roleCode);
                    return (
                      <div 
                        key={att.id}
                        className="flex items-center justify-between p-5 hover:bg-white/5 bg-white/5 border border-white/5 rounded-2xl transition-all"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-11 h-11 bg-gradient-to-br from-[#7C3AED] to-[#C084FC] rounded-xl flex items-center justify-center text-white font-black text-base shadow-md">
                            {emp?.fullName?.charAt(0) || '؟'}
                          </div>
                          <div>
                            <p className="text-base font-extrabold text-white">{emp?.fullName || 'موظف غير معرف'}</p>
                            <p className="text-xs text-[#A78BFA] flex items-center gap-1.5 mt-0.5">
                              <MapPin size={11} className="text-[#C084FC]" />
                              {emp?.department || 'بدون قسم'}
                            </p>
                          </div>
                        </div>

                        <div className="text-left flex flex-col items-end gap-1 font-mono">
                          <div className="bg-emerald-500/10 px-3 py-1 rounded-lg border border-emerald-500/20">
                            <span className="text-xs font-bold text-emerald-400">{att.checkIn}</span>
                          </div>
                          <span className="text-[10px] text-white/50">{att.date}</span>
                          {att.delayMinutes && att.delayMinutes > 0 ? (
                            <span className="text-[10px] font-black bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded-md mt-1">
                              تأخير: {formatDelayMinutes(att.delayMinutes)}
                            </span>
                          ) : (
                            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/10 px-2 py-0.5 rounded-md mt-1">
                              منضبط الحضور
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Pending Requests Modal */}
      <AnimatePresence>
        {requestsModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setRequestsModalOpen(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-md"
            />

            {/* Content Container */}
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-[#1C0D2D] border border-white/10 rounded-[2.5rem] w-full max-w-2xl overflow-hidden relative z-15 shadow-[0_25px_60px_rgba(0,0,0,0.8)] flex flex-col max-h-[85vh]"
            >
              {/* Header */}
              <div className="p-8 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-[#1C0D2D] to-[#25103C]">
                <div>
                  <h4 className="text-2xl font-black text-white flex items-center gap-3">
                    <AlertTriangle className="text-orange-400 animate-pulse" size={26} />
                    مراجعة الطلبات المعلقة
                  </h4>
                  <p className="text-xs text-[#A78BFA] mt-1 font-medium">إجمالي الطلبات بانتظار اتخاذ قرار: {pendingRequests.length} طلبات</p>
                </div>
                <button 
                  onClick={() => setRequestsModalOpen(false)}
                  className="w-10 h-10 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-xl flex items-center justify-center border border-white/5 hover:border-white/10 transition-all cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* List */}
              <div className="p-8 overflow-y-auto space-y-6 custom-scrollbar flex-1 bg-[#12071F]">
                {pendingRequests.length === 0 ? (
                  <div className="py-20 text-center text-[#A78BFA] opacity-50 flex flex-col items-center">
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4 border border-white/5">
                      <Check className="text-emerald-400 opacity-40 animate-bounce" size={28} />
                    </div>
                    <p className="text-base font-bold">كل الطلبات تمت مراجعتها بالكامل! 🎉</p>
                    <p className="text-xs mt-1">لا توجد أي طلبات معلقة بانتظار المراجعة حالياً.</p>
                  </div>
                ) : (
                  pendingRequests.map((req, i) => {
                    const emp = employees.find(e => req.userId ? e.id === req.userId : (req.roleCode && e.roleCode && e.roleCode.toLowerCase() === req.roleCode.toLowerCase()));
                    return (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        key={req.id}
                        className="p-6 bg-[#160A29]/80 border border-white/5 rounded-3xl relative overflow-hidden group space-y-4 text-right"
                      >
                        <div className="absolute top-0 right-0 w-1.5 h-full bg-orange-500/80" />
                        
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-[#7C3AED] to-[#C084FC] rounded-xl flex items-center justify-center text-white font-black text-sm">
                              {emp?.fullName?.charAt(0) || '؟'}
                            </div>
                            <div>
                              <p className="text-sm font-extrabold text-white">{emp?.fullName || 'غير معرف'}</p>
                              <p className="text-[11px] text-[#A78BFA]">{emp?.department || 'بدون قسم'}</p>
                            </div>
                          </div>

                          <div className="text-left font-mono text-[11px] text-white/50">
                            {req.createdAt?.toDate ? new Date(req.createdAt.toDate()).toLocaleDateString('ar-EG') : ''}
                          </div>
                        </div>

                        {/* Details */}
                        <div className="bg-[#12071F]/50 p-4 rounded-xl border border-white/5 space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] bg-orange-500/10 text-orange-400 border border-orange-500/10 px-2 py-0.5 rounded-md font-bold uppercase tracking-wider">
                              {req.type === 'permission' ? 'طلب إذن' : req.type === 'remote' ? 'يوم ريموت' : 'طلب إجازة'}
                            </span>
                            <span className="text-xs text-[#A78BFA] font-bold font-mono">
                              {req.type === 'permission' 
                                ? `${req.date} (${formatStringTimeTo12Hour(req.fromTime)} - ${formatStringTimeTo12Hour(req.toTime)})`
                                : `${req.fromDate} إلى ${req.toDate}`
                              }
                            </span>
                          </div>

                          {req.reason && (
                            <p className="text-xs text-white/80 leading-relaxed italic border-r-2 border-[#7C3AED]/20 pr-2.5">
                              "{req.reason}"
                            </p>
                          )}
                        </div>

                        {/* Swift Actions */}
                        <div className="flex gap-3 justify-end pt-2">
                          <button
                            onClick={() => handleUpdateStatus(req.id, 'Rejected')}
                            className="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white px-5 py-2 rounded-xl text-xs font-black transition-all border border-red-500/20 hover:scale-105 active:scale-95 flex items-center gap-1.5 cursor-pointer"
                          >
                            <X size={14} />
                            رفض الطلب
                          </button>
                          <button
                            onClick={() => handleUpdateStatus(req.id, 'Approved')}
                            className="bg-green-500/10 hover:bg-green-500 text-green-500 hover:text-white px-5 py-2 rounded-xl text-xs font-black transition-all border border-green-500/20 hover:scale-105 active:scale-95 flex items-center gap-1.5 cursor-pointer"
                          >
                            <Check size={14} />
                            الموافقة والقبول
                          </button>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

const formatDelayMinutes = (minutes: number) => {
  if (!minutes || minutes <= 0) return 'منضبط 🌟';
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (hrs > 0) {
    if (mins > 0) {
      return `${hrs} س و ${mins} د`;
    }
    return `${hrs} س`;
  }
  return `${mins} د`;
};

const colorConfig: Record<string, {
  borderHover: string;
  iconBox: string;
  rankBadge: string;
  pill: string;
  glow: string;
}> = {
  most_committed: {
    borderHover: "hover:border-emerald-500/30 hover:shadow-[0_15px_35px_rgba(16,185,129,0.15)]",
    iconBox: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    rankBadge: "bg-emerald-500/15 text-emerald-400",
    pill: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20",
    glow: "from-emerald-500/20 to-transparent"
  },
  least_committed: {
    borderHover: "hover:border-rose-500/30 hover:shadow-[0_15px_35px_rgba(244,63,94,0.15)]",
    iconBox: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    rankBadge: "bg-rose-500/15 text-rose-400",
    pill: "bg-rose-500/15 text-rose-400 border border-rose-500/20",
    glow: "from-rose-500/20 to-transparent"
  },
  most_vacations: {
    borderHover: "hover:border-amber-500/30 hover:shadow-[0_15px_35px_rgba(245,158,11,0.15)]",
    iconBox: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    rankBadge: "bg-amber-500/15 text-amber-400",
    pill: "bg-amber-500/15 text-amber-400 border border-amber-500/20",
    glow: "from-amber-500/20 to-transparent"
  },
  most_permissions: {
    borderHover: "hover:border-sky-500/30 hover:shadow-[0_15px_35px_rgba(14,165,233,0.15)]",
    iconBox: "bg-sky-500/10 text-sky-400 border-sky-500/20",
    rankBadge: "bg-sky-500/15 text-sky-400",
    pill: "bg-sky-500/15 text-sky-400 border border-sky-500/20",
    glow: "from-sky-500/20 to-transparent"
  }
};

const LeaderboardCard = ({ title, icon: Icon, items, type, emptyText }: any) => {
  const cfg = colorConfig[type] || {
    borderHover: "hover:border-purple-500/30 hover:shadow-[0_15px_35px_rgba(124,58,237,0.15)]",
    iconBox: "bg-purple-500/10 text-[#C084FC] border-purple-500/20",
    rankBadge: "bg-purple-500/15 text-[#C084FC]",
    pill: "bg-purple-500/15 text-[#C084FC] border border-purple-500/20",
    glow: "from-purple-500/20 to-transparent"
  };

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4 }}
      className={cn(
        "bg-[#160A29]/60 backdrop-blur-2xl p-6 rounded-[2rem] border border-white/10 shadow-[0_15px_35px_rgba(0,0,0,0.2)] flex flex-col hover:bg-[#1E0F33]/80 transition-all duration-300 relative overflow-hidden group",
        cfg.borderHover
      )}
    >
      {/* Dynamic Glow background */}
      <div className={cn("absolute -bottom-10 -right-10 w-24 h-24 blur-[40px] opacity-10 group-hover:opacity-30 transition-opacity bg-gradient-to-br", cfg.glow)} />

      <div className="flex items-center gap-3.5 mb-6 relative z-10">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center border", cfg.iconBox)}>
          <Icon size={20} />
        </div>
        <h5 className="text-base font-extrabold text-white">{title}</h5>
      </div>

      <div className="space-y-3 relative z-10">
        {items.length === 0 ? (
          <div className="py-12 text-center text-xs text-[#A78BFA] opacity-50 font-bold whitespace-normal">
            {emptyText}
          </div>
        ) : (
          items.map((stat: any, index: number) => (
            <div 
              key={stat.employee.id || `${stat.employee.roleCode}-${index}`} 
              className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all text-right"
              dir="rtl"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0", cfg.rankBadge)}>
                  #{index + 1}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate max-w-[120px] sm:max-w-none">
                    {stat.employee.fullName}
                  </p>
                  <p className="text-[10px] text-[#A78BFA] opacity-75 truncate max-w-[100px] sm:max-w-none">
                    {stat.employee.department} - {stat.employee.roleCode}
                  </p>
                </div>
              </div>

              <div className="text-left shrink-0">
                {type === 'most_committed' && (
                  <span className={cn("text-[10px] font-black px-2.5 py-1 rounded-xl", cfg.pill)}>
                    {stat.totalDelay === 0 ? 'منضبط 🌟' : `تأخير: ${formatDelayMinutes(stat.totalDelay)}`}
                  </span>
                )}
                {type === 'least_committed' && (
                  <span className={cn("text-[10px] font-black px-2.5 py-1 rounded-xl", cfg.pill)}>
                    {formatDelayMinutes(stat.totalDelay)} تأخير
                  </span>
                )}
                {type === 'most_vacations' && (
                  <span className={cn("text-[10px] font-black px-2.5 py-1 rounded-xl", cfg.pill)}>
                    {stat.vacationsCount} إجازة
                  </span>
                )}
                {type === 'most_permissions' && (
                  <span className={cn("text-[10px] font-black px-2.5 py-1 rounded-xl", cfg.pill)}>
                    {stat.permissionsCount} إذن
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
};

const StatCard = ({ label, value, icon: Icon, trend, gradient, accent, delay, onClick }: any) => (
  <motion.div 
    initial={{ y: 30, opacity: 0 }}
    animate={{ y: 0, opacity: 1 }}
    transition={{ delay, duration: 0.5 }}
    whileHover={{ y: -8, transition: { duration: 0.2 } }}
    onClick={onClick}
    className={cn(
      "relative group p-[1px] rounded-[2.5rem] overflow-hidden select-none",
      onClick ? "cursor-pointer active:scale-[0.98] transition-transform" : ""
    )}
  >
    {/* Animated Border Gradient */}
    <div className={cn("absolute inset-0 bg-gradient-to-br opacity-20 group-hover:opacity-40 transition-opacity", gradient)} />
    
    <div className="glass-card-axis-interactive p-8 rounded-[2.5rem] h-full flex flex-col relative z-20 transition-all hover:border-[#E2B765]/35">
      <div className="flex items-start justify-between mb-8">
        <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-[0_10px_20px_rgba(0,0,0,0.3)] bg-gradient-to-br transition-all group-hover:scale-110", accent)}>
          <Icon size={28} />
        </div>
        <div className="text-left flex flex-col items-end gap-1">
          <span className="text-[10px] text-green-400 font-bold bg-green-500/10 px-3 py-1.5 rounded-xl border border-green-500/20 shadow-inner">
            {trend}
          </span>
          {onClick && (
            <span className="text-[9px] text-[#A78BFA]/50 group-hover:text-[#C084FC] transition-colors">
              عرض البيانات ↗
            </span>
          )}
        </div>
      </div>
      
      <div className="space-y-2 mt-auto">
        <p className="text-[#A78BFA] text-sm font-bold uppercase tracking-[0.2em] opacity-80">{label}</p>
        <h3 className="text-4xl font-black text-white tabular-nums tracking-tighter drop-shadow-md">{value}</h3>
      </div>

      {/* Decorative Glow */}
      <div className={cn("absolute -bottom-10 -right-10 w-32 h-32 blur-[80px] opacity-10 group-hover:opacity-30 transition-opacity", accent)} />
    </div>
  </motion.div>
);
