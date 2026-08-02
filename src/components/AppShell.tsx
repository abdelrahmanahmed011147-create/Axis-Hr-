import React from 'react';
import { LogOut, LayoutDashboard, User as UserIcon, Users, Calendar, ClipboardList, Settings as SettingsIcon, Menu, X, Bell, Trash2, CheckCheck, Inbox, Award } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { auth, db } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { cn } from '../lib/utils';
import { CompanyLogo } from './CompanyLogo';
import { NotificationItem } from '../types';

interface ShellProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  notifications?: NotificationItem[];
  onMarkRead?: (id: string) => void;
  onMarkAllRead?: () => void;
  onClearAll?: () => void;
}

export const AppShell: React.FC<ShellProps> = ({ 
  children, 
  activeTab, 
  setActiveTab,
  notifications = [],
  onMarkRead,
  onMarkAllRead,
  onClearAll
}) => {
  const { profile, isAdmin } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);
  const [isNotifOpen, setIsNotifOpen] = React.useState(false);
  const [evaluationAccess, setEvaluationAccess] = React.useState<string[]>([]);

  // Monitor evaluation access permission config in real-time
  React.useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'system_config'), (snap) => {
      if (snap.exists() && snap.data().evaluationAccess) {
        setEvaluationAccess(snap.data().evaluationAccess as string[]);
      } else {
        setEvaluationAccess([]);
      }
    });
    return () => unsub();
  }, []);

  // Responsive sidebar automatic collapse on mount & resize
  React.useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setIsSidebarOpen(false);
      } else {
        setIsSidebarOpen(true);
      }
    };
    handleResize(); // Initial state setting
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const menuItems = [
    // Common Dashboard - will change content based on role in App.tsx
    { id: 'dashboard', label: 'الرئيسية', icon: LayoutDashboard, role: 'any' },
    
    // Employee Only links
    { id: 'attendance', label: 'الحضور والانصراف', icon: Calendar, role: 'employee' },
    { id: 'requests', label: 'الطلبات', icon: ClipboardList, role: 'employee' },
    { id: 'my_evaluations', label: 'تقييمي', icon: Award, role: 'employee' },
    { id: 'evaluations', label: 'تقييمات الموظفين', icon: ClipboardList, role: 'any' },
    
    // Admin Only links
    { id: 'admin', label: 'طلبات الموظفين', icon: UserIcon, role: 'admin' },
    { id: 'employees_directory', label: 'بيانات الموظفين', icon: Users, role: 'admin' },
    { id: 'attendance_logs', label: 'سجلات الحضور', icon: Calendar, role: 'admin' },
    { id: 'settings', label: 'الإعدادات', icon: SettingsIcon, role: 'admin' },
  ];

  const filteredMenu = menuItems.filter(item => {
    if (item.id === 'evaluations') {
      // Admins (GM-MASTER, HR-MASTER) always see evaluations.
      // Selected employees with granted access can also see/access it.
      return isAdmin || (profile?.id && evaluationAccess.includes(profile.id));
    }
    if (item.role === 'any') return true;
    if (item.role === 'admin') return isAdmin;
    if (item.role === 'employee') return !isAdmin;
    return false;
  });

  const handleMenuItemClick = (id: string) => {
    setActiveTab(id);
    if (window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }
  };

  return (
    <div className="flex h-screen bg-transparent text-[#F5F3FF] overflow-hidden dir-rtl relative z-0" dir="rtl">
      {/* Dynamic flowing background orbs to enable real glass transparency view */}
      <div className="absolute top-20 left-10 w-[450px] h-[450px] bg-[#7C3AED]/12 rounded-full filter blur-[120px] animate-pulse pointer-events-none -z-10" style={{ animationDuration: '8s' }} />
      <div className="absolute bottom-10 right-20 w-[600px] h-[600px] bg-[#E2B765]/8 rounded-full filter blur-[150px] animate-pulse pointer-events-none -z-10" style={{ animationDuration: '12s' }} />
      <div className="absolute top-[40%] left-[30%] w-[350px] h-[350px] bg-[#C084FC]/8 rounded-full filter blur-[100px] animate-pulse pointer-events-none -z-10" style={{ animationDuration: '10s' }} />

      {/* Mobile Sidebar backdrop */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {isSidebarOpen && (
          <motion.aside
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 300, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="w-72 glass-nav-sidebar flex flex-col z-50 h-[100dvh] fixed lg:relative right-0 top-0 shadow-3xl lg:shadow-none"
          >
            <div className="p-8 border-b border-[#E2B765]/15 flex flex-col items-center text-center relative">
              {/* Close button inside sidebar on mobile */}
              <button 
                className="absolute left-4 top-4 p-1.5 hover:bg-white/5 rounded-lg text-[#E2B765] lg:hidden"
                onClick={() => setIsSidebarOpen(false)}
              >
                <X size={20} />
              </button>
              <CompanyLogo size={64} className="mb-3" />
              <h1 className="text-2xl font-bold bg-gradient-to-l from-[#FDE6B0] via-[#E2B765] to-[#B28236] bg-clip-text text-transparent">
                AXIS GROUP
              </h1>
              <p className="text-xs text-[#E2B765] mt-1 font-mono tracking-widest uppercase opacity-85">HR SYSTEM</p>
            </div>

            <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
              {filteredMenu.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleMenuItemClick(item.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 relative group/btn text-right",
                    activeTab === item.id 
                      ? "bg-gradient-to-r from-[#E2B765]/18 to-[#E2B765]/5 border border-[#E2B765]/35 text-[#FDE6B0] shadow-lg shadow-[#E2B765]/10 font-bold" 
                      : "hover:bg-white/5 text-[#A78BFA] hover:text-[#FDE6B0]"
                  )}
                >
                  <item.icon size={20} className={cn("transition-transform duration-300 group-hover/btn:scale-110", activeTab === item.id ? "text-[#E2B765]" : "text-[#A78BFA] group-hover/btn:text-[#E2B765]")} />
                  <span className="font-semibold">{item.label}</span>
                </button>
              ))}
            </nav>

            <div className="p-4 border-t border-[#E2B765]/15">
              <button 
                onClick={() => auth.signOut()}
                className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 rounded-2xl transition-colors"
              >
                <LogOut size={20} />
                <span className="font-semibold">تسجيل الخروج</span>
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 relative h-full">
        <header className="h-20 glass-nav-header flex items-center justify-between px-4 md:px-8 z-30 sticky top-0">
          <div className="flex items-center gap-2 md:gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-white/5 rounded-2xl text-[#E2B765] transition-colors"
            >
              {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            <h2 className="text-base md:text-xl font-black text-[#FDE6B0] truncate tracking-wide">
              {menuItems.find(i => i.id === activeTab)?.label}
            </h2>
          </div>

          <div className="flex items-center gap-3 md:gap-6">
            <div className="relative">
              <button 
                onClick={() => setIsNotifOpen(!isNotifOpen)}
                className={cn(
                  "p-2.5 rounded-xl transition-colors relative",
                  isNotifOpen ? "text-[#E2B765] bg-[#E2B765]/10" : "text-[#A78BFA] hover:text-[#E2B765] hover:bg-white/5"
                )}
                title="الإشعارات"
              >
                <Bell size={22} />
                {notifications.some(n => !n.isRead) && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-[#E2B765] text-[#0c0416] text-[10px] font-black rounded-full flex items-center justify-center px-1 border border-[#0c0416] animate-pulse">
                    {notifications.filter(n => !n.isRead).length}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {isNotifOpen && (
                  <>
                    {/* Backdrop cover for clicking outside */}
                    <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setIsNotifOpen(false)} />
                    
                    {/* Floating Dropdown Panel */}
                    <motion.div
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 15 }}
                      transition={{ duration: 0.15 }}
                      className="absolute left-0 mt-3 w-80 sm:w-96 bg-[#12071F]/95 backdrop-blur-2xl border border-[#E2B765]/30 rounded-2xl shadow-3xl z-50 overflow-hidden text-right"
                      dir="rtl"
                    >
                      {/* Dropdown Header */}
                      <div className="p-4 border-b border-[#E2B765]/20 bg-[#1E0F33]/60 backdrop-blur-md flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="font-extrabold text-[#FDE6B0] text-sm">الإشعارات الواردة</span>
                          {notifications.filter(n => !n.isRead).length > 0 && (
                            <span className="bg-[#E2B765]/20 text-[#E2B765] text-[10px] px-2.5 py-0.5 rounded-full font-black border border-[#E2B765]/30">
                              {notifications.filter(n => !n.isRead).length} جديد
                            </span>
                          )}
                        </div>
                        {notifications.some(n => !n.isRead) && onMarkAllRead && (
                          <button 
                            onClick={() => {
                              onMarkAllRead();
                            }}
                            className="text-[11px] font-black text-[#E2B765] hover:underline flex items-center gap-1 transition-all"
                          >
                            <CheckCheck size={14} />
                            <span>تحديد الكل كمقروء</span>
                          </button>
                        )}
                      </div>

                      {/* Dropdown Scrollable Body */}
                      <div className="max-h-80 overflow-y-auto divide-y divide-[#E2B765]/10 custom-scrollbar">
                        {notifications.length === 0 ? (
                          <div className="p-8 text-center text-[#A78BFA]/50 flex flex-col items-center justify-center gap-2">
                            <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center border border-[#E2B765]/15">
                              <Inbox className="opacity-45 text-[#E2B765]" size={20} />
                            </div>
                            <span className="text-xs font-bold">لا يوجد أي إشعارات حالياً</span>
                          </div>
                        ) : (
                          notifications.map((notif) => (
                            <div 
                              key={notif.id}
                              onClick={() => {
                                if (onMarkRead) onMarkRead(notif.id);
                                setIsNotifOpen(false);
                                if (notif.type === 'request') {
                                  setActiveTab('admin');
                                } else if (notif.type === 'employee') {
                                  setActiveTab('employees_directory');
                                }
                              }}
                              className={cn(
                                "p-4 hover:bg-white/5 transition-all cursor-pointer flex gap-3 text-right group relative",
                                !notif.isRead ? "bg-[#E2B765]/5 border-r-2 border-[#E2B765]" : "opacity-80"
                              )}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <span className={cn(
                                    "font-black text-xs transition-colors group-hover:text-[#E2B765]",
                                    !notif.isRead ? "text-white" : "text-[#A78BFA]"
                                  )}>
                                    {notif.title}
                                  </span>
                                  <span className="text-[10px] text-[#A78BFA]/60 whitespace-nowrap shrink-0 mt-0.5 font-bold">
                                    {(() => {
                                      try {
                                        const diffMs = new Date().getTime() - new Date(notif.timestamp).getTime();
                                        const diffMins = Math.floor(diffMs / 60000);
                                        if (diffMins < 1) return 'الآن';
                                        if (diffMins < 60) return `منذ ${diffMins} د`;
                                        const diffHours = Math.floor(diffMins / 60);
                                        if (diffHours < 24) return `منذ ${diffHours} س`;
                                        const diffDays = Math.floor(diffHours / 24);
                                        return `منذ ${diffDays} ي`;
                                      } catch (e) {
                                        return '';
                                      }
                                    })()}
                                  </span>
                                </div>
                                <p className="text-xs text-[#A78BFA]/85 leading-relaxed font-bold break-words line-clamp-2">
                                  {notif.body}
                                </p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Dropdown Footer */}
                      {notifications.length > 0 && onClearAll && (
                        <div className="p-2 border-t border-[#E2B765]/10 bg-white/5 text-center">
                          <button 
                            onClick={onClearAll}
                            className="w-full py-2 hover:bg-rose-500/10 text-rose-400 hover:text-rose-300 text-xs font-black rounded-lg transition-all flex items-center justify-center gap-1.5"
                          >
                            <Trash2 size={13} />
                            <span>مسح السجل بالكامل</span>
                          </button>
                        </div>
                      )}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
            <div className="flex items-center gap-2 md:gap-3 bg-white/5 py-2 px-3 md:px-4 rounded-2xl border border-[#E2B765]/15 max-w-[12rem] md:max-w-xs backdrop-blur-md">
              <div className="text-left hidden md:flex flex-col items-end">
                <span className="text-sm font-black text-white truncate max-w-[8rem]">{profile?.fullName}</span>
                <span className="text-[10px] text-[#E2B765]/80 font-black uppercase tracking-wider">{profile?.role}</span>
              </div>
              <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-gradient-to-br from-[#E2B765] to-[#B28236] flex items-center justify-center text-[#0c0416] font-extrabold text-base md:text-lg shadow-inner overflow-hidden shrink-0">
                {profile?.photoUrl ? (
                  <img 
                    src={profile.photoUrl} 
                    alt="" 
                    className="w-full h-full object-cover" 
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  profile?.fullName?.charAt(0)
                )}
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 relative">
           {children}
        </div>
      </main>
    </div>
  );
};
