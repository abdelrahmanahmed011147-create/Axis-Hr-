import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, doc, updateDoc, setDoc, serverTimestamp, where, getDocs } from 'firebase/firestore';
import { getApps, initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { recalculateAttendanceForUserAndDate } from '../lib/attendanceUtils';
import firebaseConfig from '../../firebase-applet-config.json';
import { Employee, Attendance, LeaveRequest, Settings as SettingsType } from '../types';
import { useAuth } from '../context/AuthContext';
import { Users, UserCheck, Clock, AlertTriangle, FileText, Check, X, Search, Filter, UserPlus, Phone, Lock, Briefcase, User, Code, Building, Mail, Calendar, Shield } from 'lucide-react';
import { cn, formatCairoDate, getCairoNow, formatStringTimeTo12Hour } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'react-hot-toast';

export const AdminDashboard: React.FC = () => {
  const { isAdmin, loading: authLoading } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddingEmployee, setIsAddingEmployee] = useState(false);
  const [newUserLoading, setNewUserLoading] = useState(false);
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [newUser, setNewUser] = useState({
    fullName: '',
    email: '',
    roleCode: '',
    department: '',
    jobTitle: '',
    company: '',
    phone: '',
    password: 'password123'
  });

  useEffect(() => {
    if (!isAdmin) return;
    const unsubEmployees = onSnapshot(collection(db, 'employees'), (snap) => {
      setEmployees(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() } as Employee))
          .filter(e => !(e as any).migrated) // exclude preserved migration backups
      );
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
    }, (error) => {
      console.error("Requests fetch error:", error);
    });
    const unsubSettings = onSnapshot(doc(db, 'settings', 'system_config'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as SettingsType;
        if (!data.companies || data.companies.length === 0) {
          data.companies = ["مجموعة أكسس", "شركة مدار", "شركة جذور", "الأكاديمي"];
        }
        setSettings(data);
        setNewUser(prev => ({
          ...prev,
          department: prev.department || data.departments?.[0] || '',
          jobTitle: prev.jobTitle || data.jobTitles?.[0] || '',
          company: prev.company || data.companies?.[0] || '',
        }));
      } else {
        setSettings({} as any);
      }
    }, (error) => {
      console.error("Settings fetch error:", error);
    });

    return () => {
      unsubEmployees();
      unsubAttendance();
      unsubRequests();
      unsubSettings();
    };
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewUserLoading(true);
    
    if (!newUser.roleCode || !newUser.fullName || !newUser.email) {
      toast.error('يرجى ملء البيانات الأساسية بما في ذلك البريد الإلكتروني');
      setNewUserLoading(false);
      return;
    }

    try {
      // 1. Check if email exists in Firestore first
      const emailLower = newUser.email.trim().toLowerCase();
      const q = query(collection(db, 'employees'), where('email', '==', emailLower));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        toast.error('هذا البريد الإلكتروني مسجل بالفعل لموظف آخر في قاعدة البيانات');
        setNewUserLoading(false);
        return;
      }

      const secondaryApp = getApps().find(app => app.name === 'SecondaryApp') || initializeApp(firebaseConfig, 'SecondaryApp');
      const secondaryAuth = getAuth(secondaryApp);

      const result = await createUserWithEmailAndPassword(secondaryAuth, emailLower, newUser.password);
      const user = result.user;
      
      const role = newUser.roleCode.toUpperCase().includes('MASTER') ? 
        (newUser.roleCode.toUpperCase().includes('GM') ? 'GM-MASTER' : 'HR-MASTER') : 
        'EMPLOYEE';

      const employeeData = {
        roleCode: newUser.roleCode,
        fullName: newUser.fullName,
        role: role,
        company: newUser.company || settings?.companies?.[0] || 'مجموعة أكسس',
        department: newUser.department || settings?.departments?.[0] || 'General',
        jobTitle: newUser.jobTitle || settings?.jobTitles?.[0] || 'Employee',
        phone: newUser.phone,
        email: emailLower,
        status: 'active',
        createdAt: serverTimestamp(),
      };

      // Ensure data is saved to Firestore
      await setDoc(doc(db, 'employees', user.uid), employeeData);
      
      await signOut(secondaryAuth);
      
      toast.success(`تم إنشاء حساب الموظف بنجاح: ${newUser.fullName}`);
      setNewUser({
        fullName: '',
        email: '',
        roleCode: '',
        department: settings?.departments?.[0] || '',
        jobTitle: settings?.jobTitles?.[0] || '',
        company: settings?.companies?.[0] || '',
        phone: '',
        password: 'password123'
      });
      setIsAddingEmployee(false);
    } catch (error: any) {
      console.error("Create user error:", error);
      const isEmailInUse = error.code === 'auth/email-already-in-use' || 
                           String(error.code || '').includes('email-already-in-use') ||
                           String(error.message || '').includes('email-already-in-use') ||
                           String(error.message || '').includes('auth/email-already-in-use');
      
      if (isEmailInUse) {
        const existInList = employees.some(e => e.email?.toLowerCase() === newUser.email.toLowerCase());
        if (!existInList) {
          toast.error('هذا البريد الإلكتروني مسجل مسبقاً في نظام الهوية بالكامل. يمكن للموظف تسجيل الدخول مباشرة وبدء تشغيل حسابه بضغطة زر عبر Google!');
        } else {
          toast.error('هذا البريد الإلكتروني مسجل بالفعل لموظف آخر في قاعدة البيانات.');
        }
      } else {
        toast.error(`خطأ: ${error.message || 'فشل إنشاء الحساب'}`);
      }
    } finally {
      setNewUserLoading(false);
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'permission': return 'طلب إذن';
      case 'vacation_regular': return 'إجازة اعتيادية';
      case 'vacation_sick': return 'إجازة مرضية';
      case 'remote': return 'يوم ريموت';
      default: return type;
    }
  };

  const [requestFilter, setRequestFilter] = useState<'Pending' | 'Approved' | 'Rejected' | 'All'>('Pending');
  const [dateFilterType, setDateFilterType] = useState<'All' | 'Today' | 'Yesterday' | 'CurrentMonth' | 'LastMonth' | 'Custom'>('All');
  const [customFilterDate, setCustomFilterDate] = useState('');
  const [adminComments, setAdminComments] = useState<Record<string, string>>({});

  const matchDateFilter = (req: LeaveRequest) => {
    const reqDate = req.date || req.fromDate || '';
    if (!reqDate) return false;

    const nowCairo = getCairoNow();
    const todayStr = formatCairoDate(nowCairo);

    switch (dateFilterType) {
      case 'All':
        return true;
      case 'Today':
        return reqDate === todayStr || (req.fromDate && req.toDate && todayStr >= req.fromDate && todayStr <= req.toDate);
      case 'Yesterday': {
        const yesterday = new Date(nowCairo);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = formatCairoDate(yesterday);
        return reqDate === yesterdayStr || (req.fromDate && req.toDate && yesterdayStr >= req.fromDate && yesterdayStr <= req.toDate);
      }
      case 'CurrentMonth': {
        const currentYear = nowCairo.getFullYear();
        const currentMonth = nowCairo.getMonth() + 1;
        const parts = reqDate.split('-');
        if (parts.length < 2) return false;
        const rYear = Number(parts[0]);
        const rMonth = Number(parts[1]);
        return rYear === currentYear && rMonth === currentMonth;
      }
      case 'LastMonth': {
        let lastMonth = nowCairo.getMonth();
        let lastMonthYear = nowCairo.getFullYear();
        if (lastMonth === 0) {
          lastMonth = 12;
          lastMonthYear -= 1;
        }
        const parts = reqDate.split('-');
        if (parts.length < 2) return false;
        const rYear = Number(parts[0]);
        const rMonth = Number(parts[1]);
        return rYear === lastMonthYear && rMonth === lastMonth;
      }
      case 'Custom':
        if (!customFilterDate) return true;
        return reqDate === customFilterDate || (req.fromDate && req.toDate && customFilterDate >= req.fromDate && customFilterDate <= req.toDate);
      default:
        return true;
    }
  };

  const filteredRequestsByStatus = requestFilter === 'All'
    ? requests
    : requests.filter(r => r.status === requestFilter);

  const filteredRequests = filteredRequestsByStatus.filter(req => {
    const emp = employees.find(e => req.userId ? e.id === req.userId : (req.roleCode && e.roleCode && req.roleCode.toLowerCase() === e.roleCode.toLowerCase()));
    const empName = emp?.fullName || '';
    const empCode = req.roleCode || emp?.roleCode || '';
    const matchesSearch = empName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          empCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (req.reason || '').toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch && matchDateFilter(req);
  });

  const todayStr = formatCairoDate(new Date());
  const todayAttendance = attendance.filter(a => a.date === todayStr);
  const totalDeductions = attendance.reduce((acc, curr) => acc + (curr.deductionValue || 0), 0);

  const handleRequest = async (id: string, status: 'Approved' | 'Rejected') => {
    try {
      const req = requests.find(r => r.id === id);
      const comment = adminComments[id]?.trim() || (status === 'Approved' ? 'تم قبول الطلب' : 'تم الرفض');

      await updateDoc(doc(db, 'requests', id), {
        status,
        updatedAt: serverTimestamp(),
        adminComment: comment
      });

      if (req && req.type === 'permission' && req.userId) {
        recalculateAttendanceForUserAndDate(req.userId, req.date);
      }

      toast.success(`تم ${status === 'Approved' ? 'قبول' : 'رفض'} الطلب بنجاح 🟢`);
      setAdminComments(prev => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
    } catch (e) {
      toast.error('حدث خطأ أثناء التحديث 🔴');
    }
  };

  const formatSubmissionDate = (createdAt: any) => {
    if (!createdAt) return '';
    let d: Date;
    if (createdAt.seconds) {
      d = new Date(createdAt.seconds * 1000);
    } else if (createdAt.toDate) {
      d = createdAt.toDate();
    } else {
      d = new Date(createdAt);
    }
    return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' });
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
        <p className="text-sm text-[#A78BFA] mt-2">عذراً، هذه الصفحة مخصصة لمدراء النظام فقط ولا يسمح للموظفين بالاطلاع على طلبات زملائهم أو تعديلها.</p>
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-5 duration-700 pb-10">
      <div className="flex flex-col md:flex-row items-center justify-between gap-8">
        <div>
          <h3 className="text-4xl font-black tracking-tight mb-2">طلبات الموظفين</h3>
          <p className="text-[#A78BFA] text-lg">مراجعة والتحقق من طلبات الإجازات والأذونات لجميع الموظفين</p>
        </div>
      </div>

      {/* Requests Section - Now Full Width */}
      <section className="w-full">
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="bg-white/5 backdrop-blur-3xl p-8 rounded-[3rem] border border-white/10 h-full flex flex-col shadow-[0_20px_50px_rgba(0,0,0,0.3)] relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#7C3AED]/10 blur-[100px] -z-10" />
          
          {/* Header & Tabs */}
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 mb-10 pb-6 border-b border-white/5">
            <div>
              <h3 className="text-3xl font-black">إدارة وتدقيق طلبات الموظفين</h3>
              <p className="text-xs text-[#A78BFA] uppercase tracking-widest mt-1">تتبع، قبول ورفض طلبات الإجازات والاستئذانات</p>
            </div>
            
            {/* Expanded Status Tabs */}
            <div className="flex flex-wrap gap-2 bg-white/5 p-1.5 rounded-2xl border border-white/10">
              <button 
                onClick={() => setRequestFilter('Pending')}
                className={cn(
                  "px-5 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2", 
                  requestFilter === 'Pending' 
                    ? "bg-amber-500 text-white shadow-lg shadow-amber-500/20" 
                    : "text-[#A78BFA] hover:text-white hover:bg-white/5"
                )}
              >
                <span>معلق</span>
                <span className="bg-black/20 text-white px-2 py-0.5 rounded-md text-[10px]">
                  {requests.filter(r => r.status === 'Pending').length}
                </span>
              </button>
              
              <button 
                onClick={() => setRequestFilter('Approved')}
                className={cn(
                  "px-5 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2", 
                  requestFilter === 'Approved' 
                    ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" 
                    : "text-[#A78BFA] hover:text-white hover:bg-white/5"
                )}
              >
                <span>مقبول</span>
                <span className="bg-black/20 text-white px-2 py-0.5 rounded-md text-[10px]">
                  {requests.filter(r => r.status === 'Approved').length}
                </span>
              </button>

              <button 
                onClick={() => setRequestFilter('Rejected')}
                className={cn(
                  "px-5 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2", 
                  requestFilter === 'Rejected' 
                    ? "bg-red-500 text-white shadow-lg shadow-red-500/20" 
                    : "text-[#A78BFA] hover:text-white hover:bg-white/5"
                )}
              >
                <span>مرفوض</span>
                <span className="bg-black/20 text-white px-2 py-0.5 rounded-md text-[10px]">
                  {requests.filter(r => r.status === 'Rejected').length}
                </span>
              </button>

              <button 
                onClick={() => setRequestFilter('All')}
                className={cn(
                  "px-5 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2", 
                  requestFilter === 'All' 
                    ? "bg-[#7C3AED] text-white shadow-lg shadow-[#7C3AED]/20" 
                    : "text-[#A78BFA] hover:text-white hover:bg-white/5"
                )}
              >
                <span>الكل</span>
                <span className="bg-black/20 text-white px-2 py-0.5 rounded-md text-[10px]">
                  {requests.length}
                </span>
              </button>
            </div>
          </div>

          {/* Interactive Advanced Filters Bar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 bg-white/5 p-4 rounded-3xl border border-white/5">
            {/* Search Input */}
            <div className="relative">
              <span className="absolute inset-y-0 right-4 flex items-center text-white/40 pointer-events-none">
                <Search size={18} />
              </span>
              <input 
                type="text"
                placeholder="ابحث باسم الموظف، الكود، أو السبب..."
                className="w-full bg-[#12071F]/40 border border-white/10 rounded-2xl py-3.5 pr-12 pl-4 text-sm text-white outline-none focus:border-[#7C3AED]/50 focus:ring-1 focus:ring-[#7C3AED]/20 transition-all text-right"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Date Filter Dropdown */}
            <div className="relative">
              <span className="absolute inset-y-0 right-4 flex items-center text-white/40 pointer-events-none">
                <Calendar size={18} />
              </span>
              <select
                className="w-full bg-[#12071F]/40 border border-white/10 rounded-2xl py-3.5 pr-12 pl-4 text-sm text-white outline-none focus:border-[#7C3AED]/50 focus:ring-1 focus:ring-[#7C3AED]/20 transition-all text-right appearance-none cursor-pointer"
                value={dateFilterType}
                onChange={(e) => setDateFilterType(e.target.value as any)}
              >
                <option value="All" className="bg-[#1C162E] text-white">كافة التواريخ</option>
                <option value="Today" className="bg-[#1C162E] text-white">اليوم</option>
                <option value="Yesterday" className="bg-[#1C162E] text-white">أمس</option>
                <option value="CurrentMonth" className="bg-[#1C162E] text-white">الشهر الحالي</option>
                <option value="LastMonth" className="bg-[#1C162E] text-white">الشهر الفائت</option>
                <option value="Custom" className="bg-[#1C162E] text-white">تاريخ مخصص...</option>
              </select>
              <span className="absolute inset-y-0 left-4 flex items-center text-white/40 pointer-events-none">↓</span>
            </div>

            {/* Custom Date Picker (Visible when "Custom" is selected) */}
            <div className={cn("transition-all duration-300", dateFilterType === 'Custom' ? "opacity-100 scale-100 pointer-events-auto" : "opacity-40 scale-95 pointer-events-none")}>
              <input 
                type="date"
                className="w-full bg-[#12071F]/40 border border-white/10 rounded-2xl py-3.5 px-4 text-sm text-white outline-none focus:border-[#7C3AED]/50 focus:ring-1 focus:ring-[#7C3AED]/20 transition-all text-center [color-scheme:dark]"
                value={customFilterDate}
                onChange={(e) => setCustomFilterDate(e.target.value)}
                disabled={dateFilterType !== 'Custom'}
              />
            </div>
          </div>
          
          {/* Requests Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence mode="popLayout">
              {filteredRequests.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="col-span-full text-center py-40 text-[#A78BFA] opacity-50 flex flex-col items-center justify-center bg-white/5 rounded-3xl border border-white/5"
                >
                  <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mb-6">
                    <Check size={48} className="opacity-25" />
                  </div>
                  <p className="text-2xl font-bold tracking-tight">لا توجد طلبات تطابق الفلاتر المحددة</p>
                  <p className="mt-2 text-sm">جرب تغيير حالة الطلب أو تصفية التاريخ أو مسح حقل البحث</p>
                </motion.div>
              ) : (
                filteredRequests.map((req, i) => {
                  const emp = employees.find(e => req.userId ? e.id === req.userId : (req.roleCode && e.roleCode && req.roleCode.toLowerCase() === e.roleCode.toLowerCase()));
                  const companyName = req.company || emp?.company || 'مجموعة أكسس';
                  
                  return (
                    <motion.div 
                      layout
                      initial={{ opacity: 0, y: 15, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.3, delay: i * 0.03 }}
                      key={req.id} 
                      className="bg-white/5 backdrop-blur-md p-6 rounded-[2.5rem] border border-white/5 hover:border-[#7C3AED]/30 transition-all group relative overflow-hidden flex flex-col justify-between shadow-[0_10px_30px_rgba(0,0,0,0.15)] hover:shadow-[#7C3AED]/5"
                    >
                      {/* Left Colored Ribbon */}
                      <div className={cn(
                        "absolute top-0 right-0 w-2 h-full opacity-60",
                        req.status === 'Approved' ? "bg-emerald-500" : req.status === 'Rejected' ? "bg-red-500" : "bg-amber-500"
                      )} />

                      <div>
                        {/* User Details Header */}
                        <div className="flex justify-between items-start mb-6 gap-2">
                          <div className="flex items-center gap-3">
                            {emp?.photoUrl ? (
                              <img 
                                src={emp.photoUrl} 
                                alt={emp.fullName}
                                className="w-12 h-12 rounded-2xl object-cover border border-white/10 shadow-md"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#7C3AED] to-[#C084FC] flex items-center justify-center text-white font-black shadow-lg">
                                {emp?.fullName?.charAt(0) || req.roleCode?.charAt(0) || '?'}
                              </div>
                            )}
                            <div>
                              <p className="font-black text-base group-hover:text-[#C084FC] transition-colors line-clamp-1">
                                {emp?.fullName || 'موظف غير معروف'}
                              </p>
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[10px] text-[#A78BFA] font-mono tracking-wider">كود: {req.roleCode}</span>
                                <span className="text-[10px] text-white/50 leading-none">
                                  {emp?.department} {emp?.jobTitle ? `• ${emp.jobTitle}` : ''}
                                </span>
                              </div>
                            </div>
                          </div>
                          
                          {/* Company Tag */}
                          <div className="text-left flex flex-col items-end gap-1">
                            <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 border border-white/5 text-purple-300 font-bold whitespace-nowrap">
                              {companyName}
                            </span>
                            <span className="text-[9px] text-[#A78BFA] font-mono opacity-60">
                              {req.date || req.fromDate}
                            </span>
                          </div>
                        </div>

                        {/* Request Type and Status Badge */}
                        <div className="flex flex-wrap items-center gap-2 mb-4">
                          <span className={cn(
                            "text-[10px] font-black px-3.5 py-1.5 rounded-full border uppercase tracking-widest flex items-center gap-1.5",
                            req.type === 'permission' 
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                              : "bg-purple-500/10 text-purple-300 border-purple-500/20"
                          )}>
                            <Clock size={12} />
                            {getTypeLabel(req.type)}
                          </span>
                          
                          <span className={cn(
                            "text-[10px] font-black px-3.5 py-1.5 rounded-full uppercase border shadow-sm",
                            req.status === 'Approved' 
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                              : req.status === 'Rejected' 
                                ? "bg-red-500/10 text-red-400 border-red-500/20" 
                                : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                          )}>
                            {req.status === 'Approved' ? 'مقبول' : req.status === 'Rejected' ? 'مرفوض' : 'قيد المراجعة'}
                          </span>
                        </div>

                        {/* Time & Duration Details */}
                        {req.type === 'permission' && (req.fromTime || req.toTime) && (
                          <div className="flex items-center gap-2 mb-4 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-4 py-2.5 rounded-xl font-bold w-fit" dir="rtl">
                            <span>وقت الإذن:</span>
                            <span className="font-mono">{formatStringTimeTo12Hour(req.fromTime)}</span>
                            <span className="text-white/40">←</span>
                            <span className="font-mono">{formatStringTimeTo12Hour(req.toTime)}</span>
                          </div>
                        )}

                        {req.type !== 'permission' && req.toDate && (
                          <div className="flex items-center gap-2 mb-4 text-xs text-purple-300 bg-purple-500/10 border border-purple-500/20 px-4 py-2.5 rounded-xl font-bold w-fit" dir="rtl">
                            <span>الفترة:</span>
                            <span className="font-mono text-[11px]">{req.fromDate}</span>
                            <span className="text-white/40">إلى</span>
                            <span className="font-mono text-[11px]">{req.toDate}</span>
                          </div>
                        )}
                        
                        {/* Request Reason */}
                        <div className="bg-[#12071F]/50 p-4 rounded-2xl border border-white/5 mb-4 relative group-hover:bg-[#12071F]/80 transition-colors">
                          <p className="text-xs text-[#F5F3FF]/90 italic leading-relaxed">"{req.reason}"</p>
                        </div>

                        {/* Submission Date */}
                        {req.createdAt && (
                          <p className="text-[10px] text-[#A78BFA] font-medium opacity-60 mb-6 text-left">
                            تاريخ التقديم: {formatSubmissionDate(req.createdAt)}
                          </p>
                        )}

                        {/* Approved / Rejected Comments display */}
                        {req.status !== 'Pending' && req.adminComment && (
                          <div className={cn(
                            "p-4 rounded-2xl text-xs border mb-4 text-right",
                            req.status === 'Approved' 
                              ? "bg-emerald-500/5 text-emerald-300 border-emerald-500/10" 
                              : "bg-red-500/5 text-red-300 border-red-500/10"
                          )}>
                            <p className="font-black mb-1">تعليق الإدارة:</p>
                            <p className="opacity-90 leading-relaxed">"{req.adminComment}"</p>
                          </div>
                        )}
                      </div>

                      {/* Pending Actions with Notes Input */}
                      {req.status === 'Pending' && (
                        <div className="space-y-4 mt-4 pt-4 border-t border-white/5">
                          <input 
                            type="text"
                            placeholder="ملاحظات أو سبب القبول/الرفض (اختياري)..."
                            className="w-full bg-[#12071F]/50 border border-white/5 rounded-xl py-2 px-4 text-xs text-white outline-none focus:border-[#C084FC]/40 transition-all text-right placeholder-white/30"
                            value={adminComments[req.id!] || ''}
                            onChange={(e) => setAdminComments({ ...adminComments, [req.id!]: e.target.value })}
                          />
                          <div className="flex gap-3">
                            <button 
                              onClick={() => handleRequest(req.id!, 'Approved')}
                              className="flex-1 bg-emerald-500/10 hover:bg-emerald-600 text-emerald-400 hover:text-white py-3 rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-1.5 border border-emerald-500/20 shadow-xl hover:scale-[1.02] active:scale-[0.98]"
                            >
                              <Check size={16} /> قبول
                            </button>
                            <button 
                              onClick={() => handleRequest(req.id!, 'Rejected')}
                              className="flex-1 bg-red-500/10 hover:bg-red-600 text-red-400 hover:text-white py-3 rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-1.5 border border-red-500/20 shadow-xl hover:scale-[1.02] active:scale-[0.98]"
                            >
                              <X size={16} /> رفض
                            </button>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  );
                })
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </section>
    </div>
  );
};
