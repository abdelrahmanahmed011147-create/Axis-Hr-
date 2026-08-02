/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from './lib/firebase';
import { toast } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthView } from './views/AuthView';
import { AppShell } from './components/AppShell';
import { EmployeePortal } from './views/EmployeePortal';
import { AdminDashboard } from './views/AdminDashboard';
import { SettingsView } from './views/SettingsView';
import { RequestsView } from './views/RequestsView';
import { AttendanceLogsView } from './views/AttendanceLogsView';
import { CompanyDashboard } from './views/CompanyDashboard';
import { EmployeesDirectoryView } from './views/EmployeesDirectoryView';
import { EmployeeAttendanceView } from './views/EmployeeAttendanceView';
import { EvaluationsView } from './views/EvaluationsView';
import { MyEvaluationsView } from './views/MyEvaluationsView';
import { Toaster } from 'react-hot-toast';
import { auth } from './lib/firebase';
import { NotificationItem } from './types';

function AppContent() {
  const { user, profile, loading, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');

  const [notifications, setNotifications] = useState<NotificationItem[]>(() => {
    try {
      const saved = localStorage.getItem('axis_notifications');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('axis_notifications', JSON.stringify(notifications));
    } catch (e) {
      console.error(e);
    }
  }, [notifications]);

  const handleMarkRead = (id: string) => {
    setNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, isRead: true } : n)
    );
  };

  const handleMarkAllRead = () => {
    setNotifications(prev => 
      prev.map(n => ({ ...n, isRead: true }))
    );
  };

  const handleClearAll = () => {
    setNotifications([]);
  };

  // Audio chime synthesizer via Web Audio API 
  const playChime = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      
      // Tone 1: Gentle G4
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.frequency.setValueAtTime(392, ctx.currentTime);
      gain1.gain.setValueAtTime(0.12, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start();
      osc1.stop(ctx.currentTime + 0.35);
      
      // Tone 2: Clean C5
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.frequency.setValueAtTime(523.25, ctx.currentTime + 0.1);
      gain2.gain.setValueAtTime(0.12, ctx.currentTime + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(ctx.currentTime + 0.1);
      osc2.stop(ctx.currentTime + 0.45);
    } catch (e) {
      console.warn('Audio playback blocked or failed:', e);
    }
  };

  const sessionStartTime = useRef(Date.now() - 5000); // 5 seconds margin to catch very recent actions

  const getTimestamp = (val: any) => {
    if (!val) return Date.now();
    if (val.seconds) return val.seconds * 1000;
    if (typeof val.toDate === 'function') return val.toDate().getTime();
    try {
      return new Date(val).getTime() || Date.now();
    } catch (e) {
      return Date.now();
    }
  };

  useEffect(() => {
    // Only register listener for Admin/Master roles
    if (!isAdmin || !user) return;

    // 1. Listen to pending leave/permission requests
    const qRequests = query(collection(db, 'requests'), where('status', '==', 'Pending'));
    const unsubRequests = onSnapshot(qRequests, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          const docTime = getTimestamp(data.createdAt);

          // Only process real-time notifications created after screen session started
          if (docTime < sessionStartTime.current) {
            return;
          }

          playChime();

          const typeLabel = data.type === 'permission' ? 'طلب إذن' : 
                            data.type === 'vacation_regular' ? 'إجازة اعتيادية' : 
                            data.type === 'vacation_sick' ? 'إجازة مرضية' : 
                            data.type === 'remote' ? 'يوم ريموت' : 'طلب جديد';

          // Add to system notifications state with unified stable ID
          const newNotif: NotificationItem = {
            id: `req-${change.doc.id}`,
            title: `${typeLabel} جديد 📥`,
            body: `كود الموظف: ${data.roleCode}${data.reason ? ` - السبب: ${data.reason}` : ''}`,
            timestamp: new Date().toISOString(),
            isRead: false,
            type: 'request'
          };

          setNotifications(prev => {
            if (prev.some(n => n.id === newNotif.id)) return prev;
            return [newNotif, ...prev];
          });

          toast.success(`تنبيه: ${typeLabel} للموظف (${data.roleCode})`, {
            style: {
              background: '#1E0F33',
              border: '1px solid rgba(124, 58, 237, 0.25)',
              color: '#F5F3FF',
              borderRadius: '1rem',
              direction: 'rtl'
                }
          });
        }
      });
    }, (error) => {
      console.error('Realtime requests notification error:', error);
    });

    // 2. Listen to new employees signing up
    const unsubEmployees = onSnapshot(collection(db, 'employees'), (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          const docTime = getTimestamp(data.createdAt);

          // Only process real-time notifications created after screen session started
          if (docTime < sessionStartTime.current) {
            return;
          }

          playChime();

          // Add to system notifications state with unified stable ID
          const newNotif: NotificationItem = {
            id: `emp-${change.doc.id}`,
            title: `انضمام موظف جديد 👥`,
            body: `${data.fullName || 'موظف تحت الاختبار'} - ${data.jobTitle || 'موظف جديد'}`,
            timestamp: new Date().toISOString(),
            isRead: false,
            type: 'employee'
          };

          setNotifications(prev => {
            if (prev.some(n => n.id === newNotif.id)) return prev;
            return [newNotif, ...prev];
          });

          toast.success(`موظف جديد سجل: ${data.fullName || ''}`, {
            style: {
              background: '#1E0F33',
              border: '1px solid rgba(192, 132, 252, 0.25)',
              color: '#F5F3FF',
              borderRadius: '1rem',
              direction: 'rtl'
            }
          });
        }
      });
    }, (error) => {
      console.error('Realtime employees notification error:', error);
    });

    return () => {
      unsubRequests();
      unsubEmployees();
    };
  }, [isAdmin, user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#12071F] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#7C3AED]/20 border-t-[#C084FC] rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[#A78BFA] animate-pulse">جاري تحميل نظام AXIS...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthView />;
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-[#12071F] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#7C3AED]/20 border-t-[#C084FC] rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[#A78BFA] animate-pulse">جاري سحب ملف الموظف...</p>
        </div>
      </div>
    );
  }

  // Pending activation block
  if (profile.status !== 'active') {
    return (
      <div className="min-h-screen bg-[#12071F] flex items-center justify-center p-4 select-none" dir="rtl">
        <div className="w-full max-w-md bg-[#1E0F33]/85 backdrop-blur-2xl p-10 rounded-[3rem] border border-[#7C3AED]/20 shadow-2xl relative z-10 text-center">
          <div className="w-20 h-20 bg-amber-500/10 rounded-[2.2rem] flex items-center justify-center text-amber-400 border border-amber-500/20 shadow-xl mx-auto mb-8 animate-pulse">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          
          <h2 className="text-2xl font-black text-white mb-2">تفعيل حساب الموظف</h2>
          <p className="text-[#A78BFA] text-sm leading-relaxed mb-6">
            مرحباً بك، <span className="text-white font-black">{profile.fullName || 'زميلنا الجديد'}</span>
          </p>

          <div className="p-5 bg-white/5 border border-white/5 rounded-2xl text-[#E0E7FF] text-sm font-medium leading-relaxed mb-6">
             حسابك قيد الانتظار للتفعيل حالياً. يرجى التواصل مع إدارة الموارد البشرية (HR) لتنشيط حسابك واستكمال بياناتك الوظيفية.
          </div>

          <div className="space-y-4">
            <div className="text-xs text-[#A78BFA]/50 font-mono">
              البريد: {profile.email}
            </div>
            
            <button
              onClick={() => auth.signOut()}
              className="w-full bg-white/5 border border-white/10 hover:bg-white/10 text-[#A78BFA] hover:text-white py-3.5 px-6 rounded-2xl text-xs font-bold transition-all"
            >
              تسجيل خروج
            </button>
          </div>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return isAdmin ? <CompanyDashboard /> : <EmployeePortal />;
      case 'admin':
        return <AdminDashboard />;
      case 'employees_directory':
        return <EmployeesDirectoryView />;
      case 'settings':
        return <SettingsView />;
      case 'attendance_logs':
        return <AttendanceLogsView />;
      case 'evaluations':
        return <EvaluationsView />;
      case 'my_evaluations':
        return <MyEvaluationsView />;
      case 'attendance':
        return <EmployeeAttendanceView />;
      case 'requests':
        return <RequestsView />;
      default:
        return <EmployeePortal />;
    }
  };

  return (
    <AppShell 
      activeTab={activeTab} 
      setActiveTab={setActiveTab}
      notifications={notifications}
      onMarkRead={handleMarkRead}
      onMarkAllRead={handleMarkAllRead}
      onClearAll={handleClearAll}
    >
      <Toaster position="top-left" />
      {renderContent()}
    </AppShell>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
