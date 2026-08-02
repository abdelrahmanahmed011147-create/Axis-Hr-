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
import { ForcePasswordChangeView } from './views/ForcePasswordChangeView';
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

    return () => {
      unsubRequests();
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

  // Force Password Change Block
  if (profile.mustChangePassword) {
    return <ForcePasswordChangeView />;
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
